import {
  BadRequestException,
  Injectable,
  NotFoundException,
  OnModuleInit,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { plainToInstance } from "class-transformer";
import { validate } from "class-validator";
import { nanoid } from "nanoid";
import { extname } from "path";
import { Repository } from "typeorm";
import ExcelJS from "exceljs";
import { readSpreadsheet } from "./xlsx-parser";
import { RedisService } from "../redis/redis.service";
import { CreateCocktailDto } from "../cocktails/dto/create-cocktail.dto";
import {
  Cocktail,
  CocktailStatus,
} from "../cocktails/entities/cocktail.entity";
import { normalizeSpirit } from "../cocktails/mappers/spirit.mapper";
import { User } from "../users/entities/user.entity";
import { CocktailCategory } from "../cocktails/entities/cocktail-category.entity";
import { AdminAuditLog } from "./entities/audit-log.entity";
import {
  AdminImportJob,
  ImportJobStatus,
} from "./entities/import-job.entity";

type ImportFormat = "json" | "xlsx";
type ImportRowError = { row: number; id?: string; message: string };
type ImportSummary = {
  total: number;
  succeeded: number;
  failed: number;
  errors: ImportRowError[];
};

const JSON_ARRAY_FIELDS = ["tags", "tagsEn", "images", "recipe", "steps", "stepsEn"] as const;

@Injectable()
export class ImportJobsService implements OnModuleInit {
  constructor(
    @InjectRepository(AdminImportJob)
    private readonly jobs: Repository<AdminImportJob>,
    @InjectRepository(Cocktail)
    private readonly cocktails: Repository<Cocktail>,
    @InjectRepository(CocktailCategory)
    private readonly categories: Repository<CocktailCategory>,
    @InjectRepository(User)
    private readonly users: Repository<User>,
    @InjectRepository(AdminAuditLog)
    private readonly auditLogs: Repository<AdminAuditLog>,
    private readonly redis: RedisService,
  ) {}

  async onModuleInit() {
    // A single-container deployment can safely resume work interrupted by a restart.
    await this.jobs.update(
      { status: ImportJobStatus.PROCESSING },
      { status: ImportJobStatus.PENDING },
    );
    const pending = await this.jobs.find({
      where: { status: ImportJobStatus.PENDING },
      select: { id: true },
      take: 100,
    });
    pending.forEach(({ id }) => this.schedule(id));
  }

  async create(actorId: string, file?: Express.Multer.File) {
    if (!file) throw new BadRequestException("file is required");
    const format = detectImportFormat(file);
    // Parse once before persisting so malformed files fail synchronously.
    await parseImportRows(file.buffer, format);
    const creator = await this.users.findOneBy({ id: actorId });
    if (!creator) throw new NotFoundException("User not found");
    const job = await this.jobs.save(
      this.jobs.create({
        creator,
        format,
        status: ImportJobStatus.PENDING,
        summary: { total: 0, succeeded: 0, failed: 0, errors: [] },
        error: null,
        payload: file.buffer,
      }),
    );
    this.schedule(job.id);
    return this.safeJob(job);
  }

  async list(page: number, limit: number) {
    const [rows, total] = await this.jobs.findAndCount({
      relations: { creator: true },
      order: { createdAt: "DESC" },
      skip: (page - 1) * limit,
      take: limit,
    });
    return {
      __paged: true,
      data: rows.map((row) => this.safeJob(row)),
      meta: { page, limit, total },
    };
  }

  async one(id: string) {
    const job = await this.jobs.findOne({
      where: { id },
      relations: { creator: true },
    });
    if (!job) throw new NotFoundException("Import job not found");
    return this.safeJob(job);
  }

  async retry(id: string) {
    const job = await this.jobs.findOneBy({ id });
    if (!job) throw new NotFoundException("Import job not found");
    if (job.status !== ImportJobStatus.FAILED)
      throw new BadRequestException("Only failed import jobs can be retried");
    job.status = ImportJobStatus.PENDING;
    job.error = null;
    job.summary = { total: 0, succeeded: 0, failed: 0, errors: [] };
    await this.jobs.save(job);
    this.schedule(job.id);
    return this.safeJob(job);
  }

  private schedule(id: string) {
    setImmediate(() => void this.process(id));
  }

  private async process(id: string) {
    const claimed = await this.jobs
      .createQueryBuilder()
      .update(AdminImportJob)
      .set({ status: ImportJobStatus.PROCESSING })
      .where("id = :id AND status = :status", {
        id,
        status: ImportJobStatus.PENDING,
      })
      .execute();
    if (!claimed.affected) return;
    const job = await this.jobs
      .createQueryBuilder("job")
      .addSelect("job.payload")
      .leftJoinAndSelect("job.creator", "creator")
      .where("job.id = :id", { id })
      .getOne();
    if (!job) return;
    try {
      const rows = await parseImportRows(job.payload, job.format);
      const summary: ImportSummary = {
        total: rows.length,
        succeeded: 0,
        failed: 0,
        errors: [],
      };
      for (let index = 0; index < rows.length; index += 1) {
        try {
          const cocktail = await this.toCocktail(rows[index], job.creator);
          await this.cocktails.insert(cocktail);
          summary.succeeded += 1;
        } catch (error) {
          summary.failed += 1;
          summary.errors.push({
            row: index + 2,
            id: stringOrUndefined(rows[index]?.id),
            message: errorMessage(error),
          });
        }
      }
      job.status = ImportJobStatus.COMPLETED;
      job.summary = summary;
      job.error = null;
      await this.jobs.save(job);
      await this.auditLogs.save(
        this.auditLogs.create({
          actor: job.creator,
          action: "imports.complete",
          targetType: "import_job",
          targetId: job.id,
          before: null,
          after: summary,
        }),
      );
      await this.invalidateCocktailCache();
    } catch (error) {
      job.status = ImportJobStatus.FAILED;
      job.error = errorMessage(error);
      await this.jobs.save(job);
    }
  }

  private async toCocktail(
    raw: Record<string, unknown>,
    creator: User | null,
  ) {
    const normalized = normalizeImportRow(raw);
    const dto = plainToInstance(CreateCocktailDto, normalized);
    const errors = await validate(dto, {
      whitelist: true,
      forbidNonWhitelisted: true,
    });
    if (errors.length) throw new Error(flattenValidationErrors(errors));
    const spirit = dto.spirit ?? dto.base;
    if (!spirit) throw new Error("spirit or base is required");
    const normalizedSpirit =
      normalizeSpirit(spirit) ?? spirit.trim().toLowerCase();
    const category = await this.categories
      .createQueryBuilder("category")
      .where(
        "(LOWER(category.code) = :value OR LOWER(category.name) = :value OR LOWER(COALESCE(category.nameEn, '')) = :value) AND category.isActive = true",
        { value: normalizedSpirit.toLowerCase() },
      )
      .getOne();
    if (!category) throw new Error("baseSpirit category does not exist or is inactive");
    const requestedId = stringOrUndefined(raw.id)?.trim();
    if (requestedId && !/^[A-Za-z0-9_-]{1,32}$/.test(requestedId))
      throw new Error("id must contain only letters, numbers, _ or -");
    const { isPrivate = false, base: _base, ...fields } = dto;
    return this.cocktails.create({
      ...fields,
      id: requestedId || nanoid(12),
      spirit: category.code,
      category,
      isOfficial: !isPrivate,
      isPrivate,
      status: isPrivate ? CocktailStatus.DRAFT : CocktailStatus.PUBLISHED,
      owner: isPrivate ? creator : null,
      reviewer: null,
      submittedAt: null,
      reviewedAt: isPrivate ? null : new Date(),
      rejectReason: null,
      publishedAt: isPrivate ? null : new Date(),
      offlineReason: null,
    });
  }

  private safeJob(job: AdminImportJob) {
    const { payload: _payload, creator, ...safe } = job;
    return {
      ...safe,
      creator: creator
        ? { id: creator.id, email: creator.email, name: creator.name }
        : null,
    };
  }

  private async invalidateCocktailCache() {
    await Promise.all([
      this.redis.del("list:v1:*"),
      this.redis.del("list:v4:*"),
      this.redis.del("daily-recommendations:v1:*"),
      this.redis.del("list:v2:*"),
      this.redis.del("rec:v1:*"),
    ]);
  }
}

export function detectImportFormat(file: Express.Multer.File): ImportFormat {
  const extension = extname(file.originalname).toLowerCase();
  if (extension === ".json" || file.mimetype === "application/json")
    return "json";
  if (
    extension === ".xlsx" ||
    file.mimetype ===
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
  )
    return "xlsx";
  throw new BadRequestException("Only .json and .xlsx files are supported");
}

export async function parseImportRows(
  payload: Buffer,
  format: ImportFormat,
): Promise<Record<string, unknown>[]> {
  if(payload.length>10*1024*1024) throw new BadRequestException("Import exceeds 10 MB");
  let value: unknown;
  try {
    if (format === "json") {
      value = JSON.parse(payload.toString("utf8"));
    } else {
      value = await readSpreadsheet(payload);
    }
  } catch (error) {
    throw new BadRequestException(`File cannot be parsed: ${errorMessage(error)}`);
  }
  if (!Array.isArray(value) && isRecord(value) && Array.isArray(value.cocktails))
    value = value.cocktails;
  if (!Array.isArray(value) || !value.length)
    throw new BadRequestException(
      "File must contain a non-empty array of cocktails",
    );
  if (value.length > 5000)
    throw new BadRequestException("A single import is limited to 5000 rows");
  if (!value.every(isRecord))
    throw new BadRequestException("Every imported row must be an object");
  return value as Record<string, unknown>[];
}

export async function createImportTemplate(): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  const rows = [
    {
      name: "内格罗尼",
      nameEn: "Negroni",
      baseSpirit: "gin",
      abv: 24,
      description: "苦甜交织的经典鸡尾酒。",
      descriptionEn: "A classic bittersweet cocktail.",
      tags: '["苦甜","经典"]',
      tagsEn: '["Bittersweet","Classic"]',
      glass: "古典杯",
      glassEn: "Old fashioned glass",
      garnish: "橙皮",
      garnishEn: "Orange peel",
      flavor: "苦甜平衡，带柑橘香气。",
      flavorEn: "Bittersweet with citrus notes.",
      ingredients:
        '[{"name":"金酒","nameEn":"Gin","amount":30,"unit":"ml"},{"name":"金巴利","nameEn":"Campari","amount":30,"unit":"ml"},{"name":"甜味美思","nameEn":"Sweet vermouth","amount":30,"unit":"ml"}]',
      steps: '["加入冰块","搅拌后滤入杯中"]',
      stepsEn: '["Add ice.","Stir and strain into the glass."]',
      imageUrl: "https://example.com/negroni.webp",
      isPrivate: false,
    },
  ];
  const sheet=workbook.addWorksheet("cocktails");
  sheet.columns=Object.keys(rows[0]).map(key=>({header:key,key}));
  sheet.addRows(rows);
  return Buffer.from(await workbook.xlsx.writeBuffer());
}

export function normalizeImportRow(raw: Record<string, unknown>) {
  const row = { ...raw };
  row.zh = row.zh ?? row.name;
  row.en = row.en ?? row.nameEn;
  if (typeof row.en === "string" && !row.en.trim()) row.en = undefined;
  row.spirit = row.spirit ?? row.baseSpirit ?? row.base;
  row.story = row.story ?? row.description;
  if (row.storyEn !== undefined || row.descriptionEn !== undefined)
    row.storyEn = row.storyEn ?? row.descriptionEn;
  row.recipe = row.recipe ?? row.ingredients;
  if (row.images === undefined && row.imageUrl)
    row.images = [String(row.imageUrl).trim()];
  row.isPrivate = parseBoolean(row.isPrivate);
  for (const field of JSON_ARRAY_FIELDS) {
    const value = row[field];
    if (typeof value === "string") {
      const trimmed = value.trim();
      if (!trimmed) row[field] = [];
      else {
        try {
          row[field] = JSON.parse(trimmed);
        } catch {
          if (field === "recipe") row[field] = parseRecipeText(trimmed);
          else if (field === "steps" || field === "stepsEn") row[field] = parseStepsText(trimmed);
          else if (field === "tags" || field === "tagsEn" || field === "images")
            row[field] = trimmed
              .split(/[,，\r\n]+/)
              .map((x) => x.trim())
              .filter(Boolean);
        }
      }
    }
  }
  if (Array.isArray(row.recipe))
    row.recipe = row.recipe.map(normalizeIngredient);
  if (typeof row.abv === "string" && row.abv.trim()) row.abv = Number(row.abv);
  const spirit = normalizeSpirit(row.spirit ?? row.base);
  if (spirit) row.spirit = spirit;
  delete row.id;
  delete row.base;
  delete row.name;
  delete row.nameEn;
  delete row.baseSpirit;
  delete row.description;
  delete row.descriptionEn;
  delete row.ingredients;
  delete row.imageUrl;
  return row;
}

function normalizeIngredient(value: unknown) {
  if (!isRecord(value)) return value;
  if (typeof value.n === "string") return value;
  const name = stringOrUndefined(value.name)?.trim();
  if (!name) return value;
  const amount =
    typeof value.amount === "number"
      ? value.amount
      : Number(String(value.amount ?? ""));
  const unit = String(value.unit ?? "ml").trim().toLowerCase();
  const translations = {
    ...(value.nameEn !== undefined ? { nEn: value.nameEn } : {}),
    ...(value.amountTextEn !== undefined ? { tEn: value.amountTextEn } : {}),
  };
  if (Number.isFinite(amount) && unit === "ml") return { n: name, ml: amount, ...translations };
  const text = [value.amount, value.unit].filter((x) => x != null).join(" ");
  return { n: name, ...(text ? { t: text } : {}), ...translations };
}

function parseRecipeText(value: string) {
  return value
    .split(/\r?\n|;/)
    .map((line) => line.trim().replace(/^[-•]\s*/, ""))
    .filter(Boolean)
    .map((line) => {
      const match = line.match(
        /^(.+?)\s+((?:\d+(?:\.\d+)?(?:\s*[–-]\s*\d+(?:\.\d+)?)?|适量|少许).*)$/,
      );
      if (!match)
        throw new Error(
          `recipe line must contain an ingredient name and amount: ${line}`,
        );
      const name = match[1].trim();
      const amount = match[2].trim();
      const milliliters = amount.match(/^(\d+(?:\.\d+)?)\s*ml$/i);
      return milliliters
        ? { n: name, ml: Number(milliliters[1]) }
        : { n: name, t: amount };
    });
}

function parseStepsText(value: string) {
  return value
    .split(/\r?\n/)
    .map((step) => step.trim().replace(/^\d+[.、)]\s*/, ""))
    .filter(Boolean);
}

function parseBoolean(value: unknown) {
  if (typeof value === "boolean") return value;
  if (value == null || value === "") return false;
  const normalized = String(value).trim().toLowerCase();
  if (["true", "1", "yes", "是"].includes(normalized)) return true;
  if (["false", "0", "no", "否"].includes(normalized)) return false;
  return value;
}

function flattenValidationErrors(errors: { property: string; constraints?: Record<string, string>; children?: any[] }[]) {
  return validationMessages(errors).join("; ");
}

function validationMessages(
  errors: {
    property: string;
    constraints?: Record<string, string>;
    children?: any[];
  }[],
): string[] {
  return errors.flatMap((error) => [
    ...Object.values(error.constraints || {}),
    ...(error.children ? validationMessages(error.children) : []),
  ]);
}

function isRecord(value: unknown): value is Record<string, any> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function stringOrUndefined(value: unknown) {
  return typeof value === "string" ? value : undefined;
}

function errorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  return String(error);
}
