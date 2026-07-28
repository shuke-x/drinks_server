import { ForbiddenException, Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { nanoid } from "nanoid";
import {
  BusinessException,
  ErrorCode,
} from "../../common/constants/error-code";
import { RedisService } from "../redis/redis.service";
import { User } from "../users/entities/user.entity";
import { Cocktail } from "./entities/cocktail.entity";
import { CocktailReviewLog } from "./entities/cocktail-review-log.entity";
import { CocktailStatus } from "./entities/cocktail.entity";
import { CreateCocktailDto } from "./dto/create-cocktail.dto";
import { UpdateCocktailDto } from "./dto/update-cocktail.dto";
import { QueryCocktailDto } from "./dto/query-cocktail.dto";
import { spiritToBase } from "./mappers/spirit.mapper";
@Injectable()
export class CocktailsService {
  constructor(
    @InjectRepository(Cocktail) private readonly repo: Repository<Cocktail>,
    @InjectRepository(User) private readonly users: Repository<User>,
    @InjectRepository(CocktailReviewLog) private readonly reviewLogs: Repository<CocktailReviewLog>,
    private readonly redis: RedisService,
  ) {}
  private out(x: Cocktail) {
    const { owner, ...safe } = x;
    return { ...safe, base: spiritToBase(x.spirit), deletedAt: undefined };
  }
  async list(q: QueryCocktailDto) {
    const cache =
      !q.spirit && q.page === 1
        ? await this.redis.get<any>("list:v2:p1")
        : null;
    if (cache) return cache;
    const where: any = {
      isPrivate: false, status: CocktailStatus.PUBLISHED,
      ...(q.spirit ? { spirit: q.spirit } : {}),
    };
    const [rows, total] = await this.repo.findAndCount({
      where,
      order: { createdAt: "ASC" },
      skip: (q.page - 1) * q.limit,
      take: q.limit,
    });
    const result = {
      __paged: true,
      data: rows.map((x) => this.out(x)),
      meta: { page: q.page, limit: q.limit, total },
    };
    if (!q.spirit && q.page === 1)
      await this.redis.withTTL("list:v2:p1", result, 60);
    return result;
  }
  async one(id: string, userId?: string) {
    const x = await this.raw(id);
    if ((x.isPrivate || x.status !== CocktailStatus.PUBLISHED) && x.owner?.id !== userId)
      throw new BusinessException(ErrorCode.NOT_FOUND, "Cocktail not found");
    return this.out(x);
  }
  async create(dto: CreateCocktailDto, userId?: string) {
    const spirit = dto.spirit ?? dto.base;
    if (!userId) throw new ForbiddenException("Login is required to create a cocktail");
    if (!spirit)
      throw new BusinessException(
        ErrorCode.VALIDATION,
        "base or spirit is required",
      );
    if (dto.isPrivate && !userId)
      throw new ForbiddenException(
        "Login is required to create a private cocktail",
      );
    const owner = await this.users.findOneBy({ id: userId });
    if (userId && !owner) throw new ForbiddenException("User no longer exists");
    const { isPrivate, ...fields } = dto;
    const x = this.repo.create({
      ...fields,
      spirit,
      id: nanoid(12),
      isOfficial: false, status: CocktailStatus.DRAFT,
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
    if (![CocktailStatus.DRAFT, CocktailStatus.REJECTED, CocktailStatus.OFFLINE].includes(x.status))
      throw new BusinessException(ErrorCode.CONFLICT, "Withdraw a pending cocktail before editing it");
    if (x.isOfficial)
      throw new BusinessException(
        ErrorCode.CONFLICT,
        "Official cocktails cannot be modified",
      );
    const spirit = dto.spirit ?? dto.base;
    const { isPrivate, ...fields } = dto;
    if (isPrivate !== undefined) {
      if (isPrivate && !userId)
        throw new ForbiddenException(
          "Login is required to create a private cocktail",
        );
      x.isPrivate = isPrivate;
      if (isPrivate) x.status = CocktailStatus.DRAFT;
    }
    Object.assign(x, fields, spirit ? { spirit } : {});
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
    if (x.isPrivate) throw new BusinessException(ErrorCode.CONFLICT, "Private cocktails cannot be submitted");
    if (![CocktailStatus.DRAFT, CocktailStatus.REJECTED, CocktailStatus.OFFLINE].includes(x.status))
      throw new BusinessException(ErrorCode.CONFLICT, "Cocktail cannot be submitted in its current state");
    const from = x.status;
    x.status = CocktailStatus.PENDING; x.submittedAt = new Date(); x.reviewedAt = null; x.reviewer = null; x.rejectReason = null; x.offlineReason = null;
    await this.repo.manager.transaction(async (manager) => {
      await manager.save(x);
      await manager.save(CocktailReviewLog, manager.create(CocktailReviewLog, { cocktail: x, action: "submit", fromStatus: from, toStatus: x.status, reviewer: null, reason: null }));
    });
    return this.out(x);
  }
  async withdraw(id: string, userId: string) {
    const x = await this.raw(id);
    this.assertCanManage(x, userId);
    if (x.status !== CocktailStatus.PENDING) throw new BusinessException(ErrorCode.CONFLICT, "Only pending cocktails can be withdrawn");
    x.status = CocktailStatus.DRAFT;
    await this.repo.manager.transaction(async (manager) => {
      await manager.save(x);
      await manager.save(CocktailReviewLog, manager.create(CocktailReviewLog, { cocktail: x, action: "withdraw", fromStatus: CocktailStatus.PENDING, toStatus: CocktailStatus.DRAFT, reviewer: null, reason: null }));
    });
    return this.out(x);
  }
  async random(spirit?: any) {
    const qb = this.repo.createQueryBuilder("c").where("c.isPrivate = false AND c.status = :status", { status: CocktailStatus.PUBLISHED });
    if (spirit) qb.andWhere("c.spirit = :spirit", { spirit });
    const count = await qb.getCount();
    if (!count)
      throw new BusinessException(ErrorCode.NOT_FOUND, "Cocktail not found");
    return this.out((await qb.orderBy("RANDOM()").getOne())!);
  }
  async recommendations() {
    const date = new Date().toISOString().slice(0, 10),
      key = `rec:v1:${date}`;
    const hit = await this.redis.get<any[]>(key);
    if (hit) return hit;
    const all = await this.repo.find({
      where: { isOfficial: true, isPrivate: false, status: CocktailStatus.PUBLISHED },
      order: { createdAt: "ASC" },
    });
    if (!all.length) return [];
    let seed = [...date].reduce((a, c) => a + c.charCodeAt(0), 0);
    const pool = [...all],
      chosen: Cocktail[] = [];
    while (chosen.length < Math.min(4, pool.length)) {
      seed = (seed * 9301 + 49297) % 233280;
      chosen.push(pool.splice(seed % pool.length, 1)[0]);
    }
    const data = chosen.map((x) => this.out(x));
    const now = new Date(),
      end = new Date(now);
    end.setHours(24, 0, 0, 0);
    await this.redis.withTTL(
      key,
      data,
      Math.ceil((end.getTime() - now.getTime()) / 1000),
    );
    return data;
  }
  private async raw(id: string) {
    const x = await this.repo.findOne({
      where: { id },
      relations: { owner: true },
    });
    if (!x)
      throw new BusinessException(ErrorCode.NOT_FOUND, "Cocktail not found");
    return x;
  }
  private assertCanManage(x: Cocktail, userId?: string) {
    if (x.owner && x.owner.id !== userId)
      throw new ForbiddenException("Only the owner can modify this cocktail");
  }
  private async invalidate() {
    await Promise.all([
      this.redis.del("list:v1:*"),
      this.redis.del("list:v2:*"),
      this.redis.del("rec:v1:*"),
    ]);
  }
}
