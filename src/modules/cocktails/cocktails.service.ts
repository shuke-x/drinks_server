import { MediaAccessService } from "../upload/media-access.service";
import { ForbiddenException, Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { nanoid } from "nanoid";
import { createHash } from "crypto";
import { HttpException, HttpStatus } from "@nestjs/common";
import { In, ILike, Repository } from "typeorm";
import {
  BusinessException,
  ErrorCode,
} from "../../common/constants/error-code";
import { RedisService } from "../redis/redis.service";
import { User } from "../users/entities/user.entity";
import { CreateCocktailDto } from "./dto/create-cocktail.dto";
import { QueryCocktailDto } from "./dto/query-cocktail.dto";
import { UpdateCocktailDto } from "./dto/update-cocktail.dto";
import { CocktailCategory } from "./entities/cocktail-category.entity";
import { CocktailReviewLog } from "./entities/cocktail-review-log.entity";
import { CocktailRevision } from "./entities/cocktail-revision.entity";
import { DailyRecommendation } from "./entities/daily-recommendation.entity";
import {
  Cocktail,
  CocktailStatus,
  RecipeItem,
} from "./entities/cocktail.entity";
import { normalizeSpirit, spiritToBase } from "./mappers/spirit.mapper";
import { CocktailTranslationsDto } from "./dto/cocktail-translations.dto";

type RevisionContent = CocktailTranslationsDto & {
  zh: string;
  en: string;
  spirit: string;
  abv: number;
  color: string;
  tags: string[];
  images: string[];
  glass: string;
  garnish: string;
  flavor: string;
  story: string;
  recipe: RecipeItem[];
  steps: string[];
};

@Injectable()
export class CocktailsService {
  constructor(
    @InjectRepository(Cocktail) private readonly repo: Repository<Cocktail>,
    @InjectRepository(CocktailCategory)
    private readonly categories: Repository<CocktailCategory>,
    @InjectRepository(CocktailRevision)
    private readonly revisions: Repository<CocktailRevision>,
    @InjectRepository(User) private readonly users: Repository<User>,
    @InjectRepository(CocktailReviewLog)
    private readonly reviewLogs: Repository<CocktailReviewLog>,
    @InjectRepository(DailyRecommendation)
    private readonly dailyRecommendations: Repository<DailyRecommendation>,
    private readonly redis: RedisService,
    private readonly media: MediaAccessService,
  ) {}

  private out(x: Cocktail) {
    const { owner, ownerDeletedAt, reviewer, category, ...safe } = x;
    return {
      ...safe,
      category,
      base: category?.name ?? spiritToBase(x.spirit),
      publisher: owner
        ? {
            id: owner.id,
            name: owner.name,
            avatarUrl: owner.avatarUrl,
            deleted: false,
          }
        : ownerDeletedAt
          ? {
              id: null,
              name: "该账户已注销",
              avatarUrl: null,
              deleted: true,
            }
          : null,
      deletedAt: undefined,
    };
  }

  private readonly queries=new Map<string,Promise<unknown>>();
  async list(q:QueryCocktailDto) {
    const key='list:v4:'+createHash('sha256').update(JSON.stringify([q.page,q.limit,q.spirit??'',q.search?.trim()??''])).digest('hex');
    const hit=await this.redis.get<unknown>(key);
    if(hit) return hit;
    const pending=this.queries.get(key);if(pending) return pending;
    if(this.queries.size>=128) throw new HttpException('Too many queries',HttpStatus.TOO_MANY_REQUESTS);
    const load=this.loadList(q).then(async result=>{await this.redis.withTTL(key,result,30);return result;}).finally(()=>this.queries.delete(key));
    this.queries.set(key,load);return load;
  }
  private async loadList(q:QueryCocktailDto) {
    const category=q.spirit?await this.resolveCategory(q.spirit,false):null;
    const [rows, total] = await this.repo.findAndCount({
      where: (q.search?.trim() ? ["zh","en"] : [null]).map(field=>({
        isPrivate: false, status: CocktailStatus.PUBLISHED,
        ...(category ? { category: { id: category.id } } : {}),
        ...(field ? {[field]:ILike(`%${q.search!.trim().replace(/[\\%_]/g, '\\$&')}%`)} : {}),
      })),
      relations: { category: true, owner: true },
      order: { createdAt: "ASC", id: "ASC" },
      skip: (q.page - 1) * q.limit,
      take: q.limit,
    });
    const result = {
      __paged: true,
      data: rows.map((x) => this.out(x)),
      meta: { page: q.page, limit: q.limit, total },
    };
    return result;
  }

  async one(id: string, userId?: string) {
    const x = await this.raw(id);
    if (
      (x.isPrivate || x.status !== CocktailStatus.PUBLISHED) &&
      x.owner?.id !== userId
    )
      throw new BusinessException(ErrorCode.NOT_FOUND, "Cocktail not found");
    const latestRevision =
      x.owner?.id === userId && x.status === CocktailStatus.PUBLISHED
        ? await this.latestRevision(x.id)
        : null;
    return { ...this.out(x), latestRevision };
  }

  async create(dto: CreateCocktailDto, userId?: string) {
    if (!userId)
      throw new ForbiddenException("Login is required to create a cocktail");
    if(dto.images?.length) await this.media.assertOwned(dto.images,userId!);
    const requestedCategory = dto.spirit ?? dto.base;
    if (!requestedCategory)
      throw new BusinessException(
        ErrorCode.VALIDATION,
        "base or spirit is required",
      );
    const [owner, category] = await Promise.all([
      this.users.findOneBy({ id: userId }),
      this.resolveCategory(requestedCategory, true),
    ]);
    if (!owner) throw new ForbiddenException("User no longer exists");
    const { isPrivate, base: _base, ...fields } = dto;
    const x = this.repo.create({
      ...fields,
      spirit: category.code,
      category,
      id: nanoid(12),
      isOfficial: false,
      status: CocktailStatus.DRAFT,
      isPrivate: !!isPrivate,
      owner,
    });
    const saved = await this.repo.save(x);
    await this.invalidate();
    return this.out(saved);
  }

  async update(id: string, dto: UpdateCocktailDto, userId?: string) {
    const x = await this.raw(id);
    this.assertCanManage(x, userId);
    if(dto.images?.length) await this.media.assertOwned(dto.images,userId!);
    if (x.isOfficial)
      throw new BusinessException(
        ErrorCode.CONFLICT,
        "Official cocktails cannot be modified",
      );
    if (x.status === CocktailStatus.PUBLISHED)
      return this.savePublishedRevision(x, dto, userId!);
    if (x.status === CocktailStatus.PENDING)
      throw new BusinessException(
        ErrorCode.CONFLICT,
        "Withdraw a pending cocktail before editing it",
      );
    const requestedCategory = dto.spirit ?? dto.base;
    const category = requestedCategory
      ? await this.resolveCategory(requestedCategory, true)
      : null;
    const { isPrivate, base: _base, spirit: _spirit, ...fields } = dto;
    if (isPrivate !== undefined) {
      x.isPrivate = isPrivate;
      if (isPrivate) x.status = CocktailStatus.DRAFT;
    }
    Object.assign(
      x,
      fields,
      category ? { spirit: category.code, category } : {},
    );
    const saved = await this.repo.save(x);
    await this.invalidate();
    return this.out(saved);
  }

  async remove(id: string, userId?: string) {
    const x = await this.raw(id);
    this.assertCanManage(x, userId);
    if (x.isOfficial)
      throw new BusinessException(
        ErrorCode.CONFLICT,
        "Official cocktails cannot be deleted",
      );
    await this.repo.softRemove(x);
    await this.invalidate();
    return { id };
  }

  async submit(id: string, userId: string) {
    const x = await this.raw(id);
    this.assertCanManage(x, userId);
    if (x.status === CocktailStatus.PUBLISHED) {
      const revision = await this.latestEditableRevision(id);
      if (!revision)
        throw new BusinessException(
          ErrorCode.CONFLICT,
          "Create or edit a revision before submitting it",
        );
      revision.status = CocktailStatus.PENDING;
      revision.rejectReason = null;
      revision.reviewer = null;
      revision.reviewedAt = null;
      await this.revisions.save(revision);
      await this.reviewLogs.save(
        this.reviewLogs.create({
          cocktail: x,
          action: "revision_submit",
          fromStatus: CocktailStatus.DRAFT,
          toStatus: CocktailStatus.PENDING,
          reviewer: null,
          reason: revision.id,
        }),
      );
      return { cocktail: this.out(x), revision };
    }
    if (x.isPrivate)
      throw new BusinessException(
        ErrorCode.CONFLICT,
        "Private cocktails cannot be submitted",
      );
    if (
      ![
        CocktailStatus.DRAFT,
        CocktailStatus.REJECTED,
        CocktailStatus.OFFLINE,
      ].includes(x.status)
    )
      throw new BusinessException(
        ErrorCode.CONFLICT,
        "Cocktail cannot be submitted in its current state",
      );
    const from = x.status;
    x.status = CocktailStatus.PENDING;
    x.submittedAt = new Date();
    x.reviewedAt = null;
    x.reviewer = null;
    x.rejectReason = null;
    x.offlineReason = null;
    await this.repo.manager.transaction(async (manager) => {
      await manager.save(x);
      await manager.save(
        CocktailReviewLog,
        manager.create(CocktailReviewLog, {
          cocktail: x,
          action: "submit",
          fromStatus: from,
          toStatus: x.status,
          reviewer: null,
          reason: null,
        }),
      );
    });
    return this.out(x);
  }

  async withdraw(id: string, userId: string) {
    const x = await this.raw(id);
    this.assertCanManage(x, userId);
    if (x.status === CocktailStatus.PUBLISHED) {
      const revision = await this.revisions.findOne({
        where: { cocktail: { id }, status: CocktailStatus.PENDING },
        order: { createdAt: "DESC" },
      });
      if (!revision)
        throw new BusinessException(
          ErrorCode.CONFLICT,
          "No pending revision exists",
        );
      revision.status = CocktailStatus.DRAFT;
      await this.revisions.save(revision);
      return { cocktail: this.out(x), revision };
    }
    if (x.status !== CocktailStatus.PENDING)
      throw new BusinessException(
        ErrorCode.CONFLICT,
        "Only pending cocktails can be withdrawn",
      );
    x.status = CocktailStatus.DRAFT;
    await this.repo.manager.transaction(async (manager) => {
      await manager.save(x);
      await manager.save(
        CocktailReviewLog,
        manager.create(CocktailReviewLog, {
          cocktail: x,
          action: "withdraw",
          fromStatus: CocktailStatus.PENDING,
          toStatus: CocktailStatus.DRAFT,
          reviewer: null,
          reason: null,
        }),
      );
    });
    return this.out(x);
  }

  async random(spirit?: string) {
    const category = spirit
      ? await this.resolveCategory(spirit, false)
      : null;
    const qb = this.repo
      .createQueryBuilder("c")
      .leftJoinAndSelect("c.category", "category")
      .leftJoinAndSelect("c.owner", "owner")
      .where("c.isPrivate = false AND c.status = :status", {
        status: CocktailStatus.PUBLISHED,
      });
    if (category)
      qb.andWhere("c.categoryId = :categoryId", { categoryId: category.id });
    const count = await qb.getCount();
    if (!count)
      throw new BusinessException(ErrorCode.NOT_FOUND, "Cocktail not found");
    return this.out((await qb.orderBy("RANDOM()").getOne())!);
  }

  async recommendations() {
    const date = new Date().toISOString().slice(0, 10);
    const key = `rec:v1:${date}`;
    const hit = await this.redis.get<any[]>(key);
    if (hit) return hit;
    const all = await this.repo.find({
      where: {
        isOfficial: true,
        isPrivate: false,
        status: CocktailStatus.PUBLISHED,
      },
      relations: { category: true },
      order: { createdAt: "ASC" },
    });
    if (!all.length) return [];
    let seed = [...date].reduce((a, c) => a + c.charCodeAt(0), 0);
    const pool = [...all];
    const chosen: Cocktail[] = [];
    while (chosen.length < Math.min(4, pool.length)) {
      seed = (seed * 9301 + 49297) % 233280;
      chosen.push(pool.splice(seed % pool.length, 1)[0]);
    }
    const data = chosen.map((x) => this.out(x));
    const now = new Date();
    const end = new Date(now);
    end.setHours(24, 0, 0, 0);
    await this.redis.withTTL(
      key,
      data,
      Math.ceil((end.getTime() - now.getTime()) / 1000),
    );
    return data;
  }

  async todayRecommendations() {
    const timeZone = process.env.APP_TIME_ZONE || "Asia/Hong_Kong";
    const date = new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date());
    const key = `daily-recommendations:v1:${date}`;
    const hit = await this.redis.get<{ date: string; items: any[] }>(key);
    if (hit) return hit;
    const rows = await this.dailyRecommendations
      .createQueryBuilder("recommendation")
      .innerJoinAndSelect("recommendation.cocktail", "cocktail")
      .leftJoinAndSelect("cocktail.category", "category")
      .leftJoinAndSelect("cocktail.owner", "owner")
      .where("recommendation.recommendationDate = :date", { date })
      .andWhere("cocktail.isPrivate = false")
      .andWhere("cocktail.status = :status", { status: CocktailStatus.PUBLISHED })
      .andWhere("cocktail.deletedAt IS NULL")
      .orderBy("recommendation.sortOrder", "ASC")
      .getMany();
    const configured = rows.map((row) => this.out(row.cocktail));
    const items = configured.length ? configured : await this.recommendations();
    const result = { date, items };
    await this.redis.withTTL(key, result, 300);
    return result;
  }

  private async savePublishedRevision(
    cocktail: Cocktail,
    dto: UpdateCocktailDto,
    userId: string,
  ) {
    if (dto.isPrivate !== undefined)
      throw new BusinessException(
        ErrorCode.CONFLICT,
        "Published cocktail privacy cannot be changed in a revision",
      );
    const author = await this.users.findOneBy({ id: userId });
    if (!author) throw new ForbiddenException("User no longer exists");
    const current = await this.latestEditableRevision(cocktail.id);
    const base = current?.content as RevisionContent | undefined;
    const requestedCategory = dto.spirit ?? dto.base;
    const category = requestedCategory
      ? await this.resolveCategory(requestedCategory, true)
      : cocktail.category;
    const { isPrivate: _private, base: _base, spirit: _spirit, ...fields } =
      dto;
    const content: RevisionContent = {
      ...(base ?? this.snapshot(cocktail)),
      ...fields,
      spirit: category.code,
    };
    const revision = current ??
      this.revisions.create({
        cocktail,
        author,
        status: CocktailStatus.DRAFT,
        reviewer: null,
        reviewedAt: null,
        rejectReason: null,
      });
    revision.content = content;
    revision.status = CocktailStatus.DRAFT;
    revision.rejectReason = null;
    revision.reviewer = null;
    revision.reviewedAt = null;
    await this.revisions.save(revision);
    return { cocktail: this.out(cocktail), revision };
  }

  private snapshot(x: Cocktail): RevisionContent {
    return {
      zh: x.zh,
      en: x.en,
      spirit: x.spirit,
      abv: x.abv,
      color: x.color,
      tags: x.tags,
      images: x.images,
      glass: x.glass,
      garnish: x.garnish,
      flavor: x.flavor,
      story: x.story,
      recipe: x.recipe,
      steps: x.steps,
      storyEn: x.storyEn,
      glassEn: x.glassEn,
      garnishEn: x.garnishEn,
      flavorEn: x.flavorEn,
      tagsEn: x.tagsEn,
      stepsEn: x.stepsEn,
    };
  }

  private latestRevision(cocktailId: string) {
    return this.revisions.findOne({
      where: { cocktail: { id: cocktailId } },
      relations: { reviewer: true },
      order: { createdAt: "DESC" },
    });
  }

  private latestEditableRevision(cocktailId: string) {
    return this.revisions.findOne({
      where: {
        cocktail: { id: cocktailId },
        status: In([CocktailStatus.DRAFT, CocktailStatus.REJECTED]),
      },
      order: { createdAt: "DESC" },
    });
  }

  private async resolveCategory(value: string, requireActive: boolean) {
    const normalized = normalizeSpirit(value) ?? value.trim().toLowerCase();
    const qb = this.categories
      .createQueryBuilder("category")
      .where(
        "(LOWER(category.code) = :value OR LOWER(category.name) = :value OR LOWER(COALESCE(category.nameEn, '')) = :value)",
        { value: normalized.toLowerCase() },
      );
    if (requireActive) qb.andWhere("category.isActive = true");
    const category = await qb.getOne();
    if (!category)
      throw new BusinessException(ErrorCode.VALIDATION, "Category not found");
    return category;
  }

  private async raw(id: string) {
    const x = await this.repo.findOne({
      where: { id },
      relations: { owner: true, category: true },
    });
    if (!x)
      throw new BusinessException(ErrorCode.NOT_FOUND, "Cocktail not found");
    return x;
  }

  private assertCanManage(x: Cocktail, userId?: string) {
    if (!x.owner || x.owner.id !== userId)
      throw new ForbiddenException("Only the owner can modify this cocktail");
  }

  private async invalidate() {
    await Promise.all([
      this.redis.del("list:v1:*"),
      this.redis.del("list:v2:*"),
      this.redis.del("list:v3:*"),
      this.redis.del("list:v4:*"),
      this.redis.del("rec:v1:*"),
      this.redis.del("daily-recommendations:v1:*"),
    ]);
  }
}
