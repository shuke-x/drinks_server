import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { DataSource, In, Repository } from "typeorm";
import { RedisService } from "../redis/redis.service";
import {
  Cocktail,
  CocktailStatus,
} from "../cocktails/entities/cocktail.entity";
import { DailyRecommendation } from "../cocktails/entities/daily-recommendation.entity";
import { User } from "../users/entities/user.entity";
import { AdminAuditLog } from "./entities/audit-log.entity";

@Injectable()
export class AdminDailyRecommendationsService {
  constructor(
    private readonly dataSource: DataSource,
    @InjectRepository(DailyRecommendation)
    private readonly recommendations: Repository<DailyRecommendation>,
    @InjectRepository(Cocktail)
    private readonly cocktails: Repository<Cocktail>,
    private readonly redis: RedisService,
  ) {}

  async get(date: string) {
    this.assertDate(date);
    const items = await this.recommendations.find({
      where: { recommendationDate: date },
      relations: { cocktail: { category: true, owner: true } },
      order: { sortOrder: "ASC" },
    });
    return {
      date,
      items: items.map((item) => ({
        id: item.id,
        sortOrder: item.sortOrder,
        cocktail: item.cocktail,
      })),
    };
  }

  async replace(actorId: string, date: string, cocktailIds: string[]) {
    this.assertDate(date);
    const uniqueIds = [...new Set(cocktailIds)];
    const cocktails = uniqueIds.length
      ? await this.cocktails.find({
          where: {
            id: In(uniqueIds),
            isPrivate: false,
            status: CocktailStatus.PUBLISHED,
          },
          relations: { category: true, owner: true },
        })
      : [];
    if (cocktails.length !== uniqueIds.length)
      throw new BadRequestException(
        "All recommended cocktails must exist, be public, and be published",
      );
    const byId = new Map(cocktails.map((cocktail) => [cocktail.id, cocktail]));
    const before = await this.get(date);
    const after = await this.dataSource.transaction(async (manager) => {
      await manager.delete(DailyRecommendation, { recommendationDate: date });
      const actor = await manager.findOneBy(User, { id: actorId });
      if (!actor) throw new NotFoundException("Administrator not found");
      const rows = uniqueIds.map((id, index) =>
        manager.create(DailyRecommendation, {
          recommendationDate: date,
          cocktail: byId.get(id)!,
          sortOrder: index + 1,
          createdBy: actor,
        }),
      );
      if (rows.length) await manager.save(DailyRecommendation, rows);
      await manager.save(
        AdminAuditLog,
        manager.create(AdminAuditLog, {
          actor,
          action: "daily_recommendations.replace",
          targetType: "daily_recommendations",
          targetId: date,
          before,
          after: { date, cocktailIds: uniqueIds },
        }),
      );
      return { date, items: rows };
    });
    await this.redis.del(`daily-recommendations:v1:${date}`);
    return after;
  }

  private assertDate(date: string) {
    const parsed = new Date(`${date}T00:00:00Z`);
    if (
      !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
      Number.isNaN(parsed.getTime()) ||
      parsed.toISOString().slice(0, 10) !== date
    )
      throw new BadRequestException("date must use YYYY-MM-DD format");
  }
}
