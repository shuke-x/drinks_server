import { ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { User } from "../users/entities/user.entity";
import { Cocktail, CocktailStatus } from "./entities/cocktail.entity";
import { CocktailReport } from "./entities/cocktail-report.entity";
import { CreateCocktailReportDto } from "./dto/create-cocktail-report.dto";
import { UserBlock } from "../users/entities/user-block.entity";

@Injectable()
export class CocktailReportsService {
  constructor(
    @InjectRepository(CocktailReport) private readonly reports: Repository<CocktailReport>,
    @InjectRepository(Cocktail) private readonly cocktails: Repository<Cocktail>,
    @InjectRepository(User) private readonly users: Repository<User>,
    @InjectRepository(UserBlock) private readonly blocks: Repository<UserBlock>,
  ) {}

  async filterBlocked(userId: string | undefined, payload: any) {
    if (!userId || !payload) return payload;
    const rows = await this.blocks.find({
      where: { blocker: { id: userId } },
      relations: { blocked: true },
    });
    const ids = new Set(rows.map((row) => row.blocked.id));
    if (!ids.size) return payload;
    if (Array.isArray(payload)) return payload.filter((item: any) => !ids.has(item.publisher?.id));
    if (Array.isArray(payload.data)) return { ...payload, data: payload.data.filter((item: any) => !ids.has(item.publisher?.id)) };
    if (Array.isArray(payload.items)) return { ...payload, items: payload.items.filter((item: any) => !ids.has(item.publisher?.id)) };
    return payload;
  }

  async isBlocked(viewerId: string | undefined, ownerId: string | null | undefined) {
    if (!viewerId || !ownerId || viewerId === ownerId) return false;
    return this.blocks.exists({ where: { blocker: { id: viewerId }, blocked: { id: ownerId } } });
  }

  async create(reporterId: string, cocktailId: string, dto: CreateCocktailReportDto) {
    const [reporter, cocktail] = await Promise.all([
      this.users.findOneBy({ id: reporterId }),
      this.cocktails.findOne({ where: { id: cocktailId }, relations: { owner: true } }),
    ]);
    if (!reporter || !cocktail || cocktail.isOfficial || cocktail.status !== CocktailStatus.PUBLISHED)
      throw new NotFoundException("Public user recipe not found");
    if (cocktail.owner?.id === reporterId) throw new ConflictException("You cannot report your own recipe");
    const existing = await this.reports.findOne({ where: { reporter: { id: reporterId }, cocktail: { id: cocktailId } } });
    if (existing) return { id: existing.id, status: existing.status, alreadyReported: true };
    const report = await this.reports.save(this.reports.create({
      reporter, cocktail, reason: dto.reason, details: dto.details?.trim() || null,
    }));
    return { id: report.id, status: report.status, alreadyReported: false };
  }

  listOpen() {
    return this.reports.find({
      where: { status: "open" as any },
      relations: { reporter: true, cocktail: true },
      order: { createdAt: "ASC" },
      take: 200,
    });
  }

  async setStatus(id: string, status: "reviewed" | "dismissed") {
    const report = await this.reports.findOneBy({ id });
    if (!report) throw new NotFoundException("Report not found");
    report.status = status as any;
    return this.reports.save(report);
  }
}
