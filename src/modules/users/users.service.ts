import {
  ConflictException,
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
    @Inject(STORAGE) private readonly storage: StorageProvider,
    private readonly redis: RedisService,
  ) {}
  async me(id: string) {
    const user = await this.users.findOneBy({ id });
    if (!user) throw new NotFoundException("User not found");
    return this.profile(user);
  }
  async updateMe(id: string, dto: UpdateMeDto) {
    const user = await this.users.findOneBy({ id });
    if (!user) throw new NotFoundException("User not found");
    Object.assign(user, dto);
    return this.profile(await this.users.save(user));
  }
  async removeMe(id: string) {
    return this.removeAccount(id, false);
  }
  async removeByAdmin(id: string) {
    return this.removeAccount(id, true);
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

    const [privateCocktails, allCocktails, ownedAssets, otherUsers] =
      await Promise.all([
        this.cocktails.find({
          where: { owner: { id }, isPrivate: true },
          withDeleted: true,
        }),
        this.cocktails.find({
          relations: { owner: true },
          withDeleted: true,
        }),
        this.uploadAssets.find({ where: { owner: { id } } }),
        this.users.find({ where: { id: Not(id) } }),
      ]);
    const privateIds = privateCocktails.map((cocktail) => cocktail.id);
    const privateRevisions = privateIds.length
      ? await this.revisions.find({
          where: { cocktail: { id: In(privateIds) } },
        })
      : [];
    const retainedImages = new Set(
      [
        ...allCocktails
          .filter(
            (cocktail) => cocktail.owner?.id !== id || !cocktail.isPrivate,
          )
          .flatMap((cocktail) => cocktail.images ?? []),
        ...otherUsers.flatMap((other) =>
          other.avatarUrl ? [other.avatarUrl] : [],
        ),
      ],
    );
    const filesToRemove = new Set([
      ...(user.avatarUrl ? [user.avatarUrl] : []),
      ...ownedAssets.map((asset) => asset.url),
      ...privateCocktails.flatMap((cocktail) => cocktail.images ?? []),
      ...privateRevisions.flatMap((revision) =>
        this.revisionImages(revision.content),
      ),
    ]);
    for (const retained of retainedImages) filesToRemove.delete(retained);

    const ownerDeletedAt = new Date();
    await this.users.manager.transaction(async (manager) => {
      await manager.query(
        `DELETE FROM "cocktails" WHERE "ownerId" = $1 AND "isPrivate" = true`,
        [id],
      );
      await manager.query(
        `UPDATE "cocktails" SET "ownerDeletedAt" = $1 WHERE "ownerId" = $2 AND "isPrivate" = false`,
        [ownerDeletedAt, id],
      );
      const result = await manager.delete(User, { id });
      if (!result.affected) throw new NotFoundException("User not found");
    });

    const [cacheResults, cleanupResults] = await Promise.all([
      Promise.allSettled([
        this.redis.del("list:v1:*"),
        this.redis.del("list:v2:*"),
        this.redis.del("list:v3:*"),
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
    const rows = await this.favorites.find({
      where: { user: { id: userId } },
      relations: { cocktail: true },
      order: { createdAt: "DESC" },
    });
    return rows.map(({ cocktail, createdAt }) => ({ cocktail, createdAt }));
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
