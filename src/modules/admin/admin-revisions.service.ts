import { ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { DataSource, Repository } from "typeorm";
import { RedisService } from "../redis/redis.service";
import { CocktailCategory } from "../cocktails/entities/cocktail-category.entity";
import { CocktailReviewLog } from "../cocktails/entities/cocktail-review-log.entity";
import { CocktailRevision } from "../cocktails/entities/cocktail-revision.entity";
import { Cocktail, CocktailStatus } from "../cocktails/entities/cocktail.entity";
import { User } from "../users/entities/user.entity";
import { AdminAuditLog } from "./entities/audit-log.entity";

const CONTENT_FIELDS = [
  "zh",
  "en",
  "abv",
  "color",
  "tags",
  "images",
  "glass",
  "garnish",
  "flavor",
  "story",
  "recipe",
  "steps",
] as const;

@Injectable()
export class AdminRevisionsService {
  constructor(
    private readonly dataSource: DataSource,
    @InjectRepository(CocktailRevision)
    private readonly revisions: Repository<CocktailRevision>,
    @InjectRepository(CocktailCategory)
    private readonly categories: Repository<CocktailCategory>,
    @InjectRepository(User) private readonly users: Repository<User>,
    private readonly redis: RedisService,
  ) {}

  async review(
    actorId: string,
    cocktailId: string,
    revisionId: string,
    action: "approve" | "reject",
    reason?: string,
  ) {
    const revision = await this.revisions.findOne({
      where: { id: revisionId, cocktail: { id: cocktailId } },
      relations: { cocktail: { category: true }, author: true },
    });
    if (!revision) throw new NotFoundException("Revision not found");
    if (revision.status !== CocktailStatus.PENDING)
      throw new ConflictException("Only pending revisions can be reviewed");
    if (action === "reject" && !reason)
      throw new ConflictException("reason is required");
    const reviewer = await this.users.findOneBy({ id: actorId });
    if (!reviewer) throw new NotFoundException("Reviewer not found");
    if (action === "reject") {
      revision.status = CocktailStatus.REJECTED;
      revision.rejectReason = reason!;
      revision.reviewer = reviewer;
      revision.reviewedAt = new Date();
      await this.dataSource.transaction(async (manager) => {
        await manager.save(revision);
        await this.writeLogs(manager, revision, reviewer, "revision_reject", reason!);
      });
      return revision;
    }
    const content = revision.content as Record<string, unknown>;
    const category = await this.categories.findOneBy({
      code: String(content.spirit),
      isActive: true,
    });
    if (!category)
      throw new ConflictException("Revision category is missing or inactive");
    const cocktail = revision.cocktail;
    const before = this.snapshot(cocktail);
    for (const field of CONTENT_FIELDS)
      if (content[field] !== undefined) (cocktail as any)[field] = content[field];
    cocktail.spirit = category.code;
    cocktail.category = category;
    cocktail.status = CocktailStatus.PUBLISHED;
    cocktail.reviewer = reviewer;
    cocktail.reviewedAt = new Date();
    cocktail.publishedAt = new Date();
    cocktail.rejectReason = null;
    cocktail.offlineReason = null;
    revision.status = CocktailStatus.PUBLISHED;
    revision.rejectReason = null;
    revision.reviewer = reviewer;
    revision.reviewedAt = new Date();
    await this.dataSource.transaction(async (manager) => {
      await manager.save(cocktail);
      await manager.save(revision);
      await this.writeLogs(manager, revision, reviewer, "revision_approve", null, before, this.snapshot(cocktail));
    });
    await this.invalidate();
    return { cocktail, revision };
  }

  private async writeLogs(
    manager: any,
    revision: CocktailRevision,
    reviewer: User,
    action: string,
    reason: string | null,
    before: object | null = null,
    after: object | null = null,
  ) {
    await manager.save(
      CocktailReviewLog,
      manager.create(CocktailReviewLog, {
        cocktail: revision.cocktail,
        action,
        fromStatus: CocktailStatus.PENDING,
        toStatus: revision.status,
        reviewer,
        reason: reason ?? revision.id,
      }),
    );
    await manager.save(
      AdminAuditLog,
      manager.create(AdminAuditLog, {
        actor: reviewer,
        action: `cocktails.${action}`,
        targetType: "cocktail_revision",
        targetId: revision.id,
        before,
        after: after ?? { status: revision.status, reason },
      }),
    );
  }

  private snapshot(cocktail: Cocktail) {
    return Object.fromEntries(
      [...CONTENT_FIELDS, "spirit"].map((field) => [
        field,
        (cocktail as any)[field],
      ]),
    );
  }

  private async invalidate() {
    await Promise.all([
      this.redis.del("list:v1:*"),
      this.redis.del("list:v2:*"),
      this.redis.del("list:v3:*"),
      this.redis.del("rec:v1:*"),
    ]);
  }
}
