import {
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { DataSource, Repository } from "typeorm";
import {
  CreateCocktailCategoryDto,
  UpdateCocktailCategoryDto,
} from "../cocktails/dto/cocktail-category.dto";
import { CocktailCategory } from "../cocktails/entities/cocktail-category.entity";
import { Cocktail } from "../cocktails/entities/cocktail.entity";
import { User } from "../users/entities/user.entity";
import { AdminAuditLog } from "./entities/audit-log.entity";

@Injectable()
export class AdminCategoriesService {
  constructor(
    private readonly dataSource: DataSource,
    @InjectRepository(CocktailCategory)
    private readonly categories: Repository<CocktailCategory>,
    @InjectRepository(Cocktail)
    private readonly cocktails: Repository<Cocktail>,
  ) {}

  list() {
    return this.categories.find({
      order: { sortOrder: "ASC", createdAt: "ASC" },
    });
  }

  async create(actorId: string, dto: CreateCocktailCategoryDto) {
    if (await this.categories.exists({ where: { code: dto.code } }))
      throw new ConflictException("Category code already exists");
    return this.dataSource.transaction(async (manager) => {
      const category = await manager.save(
        manager.create(CocktailCategory, {
          ...dto,
          nameEn: dto.nameEn ?? null,
          description: dto.description ?? null,
          descriptionEn: dto.descriptionEn ?? null,
          iconUrl: dto.iconUrl ?? null,
          sortOrder: dto.sortOrder ?? 0,
          isActive: dto.isActive ?? true,
        }),
      );
      await this.audit(manager, actorId, "categories.create", category.id, null, category);
      return category;
    });
  }

  async update(
    actorId: string,
    id: string,
    dto: UpdateCocktailCategoryDto,
  ) {
    const category = await this.categories.findOneBy({ id });
    if (!category) throw new NotFoundException("Category not found");
    const before = { ...category };
    Object.assign(category, dto);
    return this.dataSource.transaction(async (manager) => {
      const saved = await manager.save(category);
      await this.audit(manager, actorId, "categories.update", id, before, saved);
      return saved;
    });
  }

  async remove(actorId: string, id: string) {
    const category = await this.categories.findOneBy({ id });
    if (!category) throw new NotFoundException("Category not found");
    const count = await this.cocktails.count({
      where: { category: { id } },
      withDeleted: true,
    });
    if (count)
      throw new ConflictException(
        "Referenced categories cannot be deleted; deactivate it instead",
      );
    await this.dataSource.transaction(async (manager) => {
      await manager.remove(category);
      await this.audit(manager, actorId, "categories.delete", id, category, null);
    });
    return { id };
  }

  private async audit(
    manager: any,
    actorId: string,
    action: string,
    targetId: string,
    before: object | null,
    after: object | null,
  ) {
    const actor = await manager.findOneBy(User, { id: actorId });
    await manager.save(
      AdminAuditLog,
      manager.create(AdminAuditLog, {
        actor,
        action,
        targetType: "cocktail_category",
        targetId,
        before,
        after,
      }),
    );
  }
}
