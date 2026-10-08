import { MediaAccessService } from "../upload/media-access.service";
import {
  ConflictException,
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { In, Not, Repository } from "typeorm";
import { Cocktail } from "../cocktails/entities/cocktail.entity";
import { CocktailStatus } from "../cocktails/entities/cocktail.entity";
import { spiritToBase } from "../cocktails/mappers/spirit.mapper";
import { CocktailRevision } from "../cocktails/entities/cocktail-revision.entity";
import { Favorite } from "./entities/favorite.entity";
import { User } from "./entities/user.entity";
import { UpdateMeDto } from "./dto/update-me.dto";
import { QueryMyCocktailsDto } from "./dto/query-my-cocktails.dto";
import { UserRole } from "../admin/entities/user-role.entity";
import { STORAGE, StorageProvider } from "../upload/storage.provider";
import { RedisService } from "../redis/redis.service";
import { UploadAsset } from "../upload/entities/upload-asset.entity";
import { UserBlock } from "./entities/user-block.entity";
@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name);

  constructor(
    @InjectRepository(User) private readonly users: Repository<User>,
    @InjectRepository(Favorite)
    private readonly favorites: Repository<Favorite>,
    @InjectRepository(Cocktail)
    private readonly cocktails: Repository<Cocktail>,
    @InjectRepository(CocktailRevision)
    private readonly revisions: Repository<CocktailRevision>,
    @InjectRepository(UserRole)
    private readonly userRoles: Repository<UserRole>,
    @InjectRepository(UploadAsset)
    private readonly uploadAssets: Repository<UploadAsset>,
    @InjectRepository(UserBlock)
    private readonly blocks: Repository<UserBlock>,
    @Inject(STORAGE) private readonly storage: StorageProvider,
    private readonly redis: RedisService,
    private readonly media: MediaAccessService,
  ) {}
  async me(id: string) {
    const user = await this.users.findOneBy({ id });
    if (!user) throw new NotFoundException("User not found");
    return this.profile(user);
  }
  async updateMe(id: string, dto: UpdateMeDto) {
    const user = await this.users.findOneBy({ id });
    if (!user) throw new NotFoundException("User not found");
    if(dto.avatarUrl) await this.media.assertOwned([dto.avatarUrl],id);
    Object.assign(user, dto);
    return this.profile(await this.users.save(user));
  }
  async removeMe(id: string) {
    return this.removeAccount(id, false);
  }
  async removeByAdmin(id: string) {
    return this.removeAccount(id, true);
  }
  async listBlockedUsers(userId: string) {
    const blocks = await this.blocks.find({
      where: { blocker: { id: userId } },
      relations: { blocked: true },
      order: { createdAt: "DESC" },
    });
    return blocks.map(({ blocked, createdAt }) => ({
      id: blocked.id,
      name: blocked.name,
      avatarUrl: blocked.avatarUrl,
      blockedAt: createdAt,
    }));
  }
  async blockUser(userId: string, blockedId: string) {
    if (blockedId === userId) throw new BadRequestException("You cannot block yourself");
    const [blocker, blocked, existing] = await Promise.all([
      this.users.findOneBy({ id: userId }),
      this.users.findOneBy({ id: blockedId }),
      this.blocks.findOne({ where: { blocker: { id: userId }, blocked: { id: blockedId } } }),
    ]);
    if (!blocker || !blocked) throw new NotFoundException("User not found");
    if (!existing) await this.blocks.save(this.blocks.create({ blocker, blocked }));
    return { success: true, alreadyBlocked: !!existing };
  }
  async unblockUser(userId: string, blockedId: string) {
    const result = await this.blocks.delete({ blocker: { id: userId }, blocked: { id: blockedId } });
    return { success: true, removed: !!result.affected };
  }
  private async removeAccount(id: string, allowSuperAdmin: boolean) {
    const user = await this.users.findOneBy({ id });
    if (!user) throw new NotFoundException("User not found");
    const isSuperAdmin = await this.userRoles.exists({
      where: { user: { id }, role: { code: "super_admin" } },
    });
    if (isSuperAdmin && !allowSuperAdmin)
      throw new ConflictException(
        "Super administrators cannot delete their own account",
      );

    const [allCocktails, ownedAssets, otherUsers] =
      await Promise.all([
        this.cocktails.find({
          relations: { owner: true },
          withDeleted: true,
        }),
        this.uploadAssets.find({ where: { owner: { id } } }),
        this.users.find({ where: { id: Not(id) } }),
      ]);
    const ownedCocktailsOnly = allCocktails.filter(
      (cocktail) => cocktail.owner?.id === id,
    );
    const ownedIds = ownedCocktailsOnly.map((cocktail) => cocktail.id);
    const ownedRevisions = ownedIds.length
      ? await this.revisions.find({
          where: { cocktail: { id: In(ownedIds) } },
        })
      : [];
    const candidateImages = new Set([
      ...(user.avatarUrl ? [user.avatarUrl] : []),
      ...ownedAssets.map((asset) => asset.url),
      ...ownedCocktailsOnly.flatMap((cocktail) => cocktail.images ?? []),
      ...ownedRevisions.flatMap((revision) =>
        this.revisionImages(revision.content),
      ),
    ]);
    const referencedRevisionImages: Array<{ image: string }> =
      candidateImages.size
        ? await this.revisions.manager.query(
            `SELECT DISTINCT image FROM cocktail_revisions revision LEFT JOIN cocktails cocktail ON cocktail.id = revision."cocktailId" CROSS JOIN LATERAL jsonb_array_elements_text(COALESCE(revision.content->'images', '[]'::jsonb)) image WHERE cocktail."ownerId" IS DISTINCT FROM $2 AND image = ANY($1::text[])`,
            [[...candidateImages], id],
          )
        : [];
    const retainedImages = new Set(
      [
        ...allCocktails
          .filter((cocktail) => cocktail.owner?.id !== id)
          .flatMap((cocktail) => cocktail.images ?? []),
        ...referencedRevisionImages.map(({ image }) => image),
        ...otherUsers.flatMap((other) =>
          other.avatarUrl ? [other.avatarUrl] : [],
        ),
      ],
    );
    const filesToRemove = new Set([
      ...(user.avatarUrl ? [user.avatarUrl] : []),
      ...ownedAssets.map((asset) => asset.url),
      ...ownedCocktailsOnly.flatMap((cocktail) => cocktail.images ?? []),
      ...ownedRevisions.flatMap((revision) =>
        this.revisionImages(revision.content),
      ),
    ]);
    for (const retained of retainedImages) filesToRemove.delete(retained);

    await this.users.manager.transaction(async (manager) => {
      await manager.query(
        `DELETE FROM "cocktails" WHERE "ownerId" = $1`,
        [id],
      );
      const result = await manager.delete(User, { id });
      if (!result.affected) throw new NotFoundException("User not found");
    });

    const [cacheResults, cleanupResults] = await Promise.all([
      Promise.allSettled([
        this.redis.del("list:v1:*"),
        this.redis.del("list:v2:*"),
        this.redis.del("list:v3:*"),
        this.redis.del("list:v4:*"),
        this.redis.del("rec:v1:*"),
        this.redis.del("daily-recommendations:v1:*"),
      ]),
      Promise.allSettled(
        [...filesToRemove].map((url) => this.storage.remove(url)),
      ),
    ]);
    const cacheFailures = cacheResults.filter(
      (result) => result.status === "rejected",
    ).length;
    if (cacheFailures)
      this.logger.warn(
        `Account ${id} was deleted, but ${cacheFailures} cache entries could not be invalidated`,
      );
    const cleanupFailures = cleanupResults.filter(
      (result) => result.status === "rejected",
    ).length;
    if (cleanupFailures)
      this.logger.warn(
        `Account ${id} was deleted, but ${cleanupFailures} image files could not be removed`,
      );
    return { success: true };
  }
  async myCocktails(userId: string, query: QueryMyCocktailsDto) {
    const [cocktails, total] = await this.cocktails.findAndCount({
      where: {
        owner: { id: userId },
        ...(query.status ? { status: query.status } : {}),
      },
      relations: { category: true },
      order: { createdAt: "DESC", id: "ASC" },
      skip: (query.page - 1) * query.limit,
      take: query.limit,
    });
    const revisions = cocktails.length
      ? await this.revisions.find({
          where: { cocktail: { id: In(cocktails.map((x) => x.id)) } },
          relations: { cocktail: true },
          order: { createdAt: "DESC" },
        })
      : [];
    const latest = new Map<string, CocktailRevision>();
    for (const revision of revisions) {
      const cocktailId = revision.cocktail?.id;
      if (cocktailId && !latest.has(cocktailId)) latest.set(cocktailId, revision);
    }
    return {
      __paged: true,
      data: cocktails.map(({ owner, ...cocktail }) => ({
        ...cocktail,
        base: cocktail.category?.name ?? spiritToBase(cocktail.spirit),
        latestRevision: latest.get(cocktail.id) ?? null,
        deletedAt: undefined,
      })),
      meta: { page: query.page, limit: query.limit, total },
    };
  }
  async listFavorites(userId: string) {
    const [rows, blockedUsers] = await Promise.all([
      this.favorites.find({
        where: { user: { id: userId } },
        relations: { cocktail: { owner: true } },
        order: { createdAt: "DESC" },
      }),
      this.blocks.find({
        where: { blocker: { id: userId } },
        relations: { blocked: true },
      }),
    ]);
    const blocked = new Set(blockedUsers.map((item) => item.blocked.id));
    return rows
      .filter(({ cocktail }) => !cocktail.owner || !blocked.has(cocktail.owner.id))
      .map(({ cocktail, createdAt }) => {
        const { owner, ...safeCocktail } = cocktail;
        return { cocktail: safeCocktail, createdAt };
      });
  }
  async addFavorite(userId: string, cocktailId: string) {
    const [user, cocktail, existing] = await Promise.all([
      this.users.findOneBy({ id: userId }),
      this.cocktails.findOne({
        where: { id: cocktailId },
        relations: { owner: true, category: true },
      }),
      this.favorites.findOne({
        where: { user: { id: userId }, cocktail: { id: cocktailId } },
      }),
    ]);
    if (!user) throw new NotFoundException("User not found");
    if (
      !cocktail ||
      ((cocktail.isPrivate || cocktail.status !== CocktailStatus.PUBLISHED) &&
        cocktail.owner?.id !== userId)
    )
      throw new NotFoundException("Cocktail not found");
    if (existing) return { cocktail, alreadyFavorite: true };
    try {
      await this.favorites.save(this.favorites.create({ user, cocktail }));
    } catch {
      throw new ConflictException("Cocktail is already favorited");
    }
    return { cocktail, alreadyFavorite: false };
  }
  async removeFavorite(userId: string, cocktailId: string) {
    const result = await this.favorites.delete({
      user: { id: userId },
      cocktail: { id: cocktailId },
    });
    if (!result.affected) throw new NotFoundException("Favorite not found");
    return { success: true };
  }
  private profile(user: User) {
    return {
      id: user.id,
      email: user.email,
      name: user.name,
      avatarUrl: user.avatarUrl,
      language: user.language,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    };
  }
  private revisionImages(content: object): string[] {
    if (!content || typeof content !== "object") return [];
    const images = (content as { images?: unknown }).images;
    return Array.isArray(images)
      ? images.filter((image): image is string => typeof image === "string")
      : [];
  }
}
