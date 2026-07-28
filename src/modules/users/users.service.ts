import {
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { In, Repository } from "typeorm";
import { Cocktail } from "../cocktails/entities/cocktail.entity";
import { CocktailStatus } from "../cocktails/entities/cocktail.entity";
import { spiritToBase } from "../cocktails/mappers/spirit.mapper";
import { CocktailRevision } from "../cocktails/entities/cocktail-revision.entity";
import { Favorite } from "./entities/favorite.entity";
import { User } from "./entities/user.entity";
import { UpdateMeDto } from "./dto/update-me.dto";
@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User) private readonly users: Repository<User>,
    @InjectRepository(Favorite)
    private readonly favorites: Repository<Favorite>,
    @InjectRepository(Cocktail)
    private readonly cocktails: Repository<Cocktail>,
    @InjectRepository(CocktailRevision)
    private readonly revisions: Repository<CocktailRevision>,
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
  async myCocktails(userId: string) {
    const cocktails = await this.cocktails.find({
      where: { owner: { id: userId } },
      relations: { category: true },
      order: { createdAt: "DESC" },
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
    return cocktails.map(({ owner, ...cocktail }) => ({
      ...cocktail,
      base: cocktail.category?.name ?? spiritToBase(cocktail.spirit),
      latestRevision: latest.get(cocktail.id) ?? null,
      deletedAt: undefined,
    }));
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
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    };
  }
}
