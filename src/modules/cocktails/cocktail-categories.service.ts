import {
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import {
  CreateCocktailCategoryDto,
  UpdateCocktailCategoryDto,
} from "./dto/cocktail-category.dto";
import { CocktailCategory } from "./entities/cocktail-category.entity";
import { Cocktail } from "./entities/cocktail.entity";

@Injectable()
export class CocktailCategoriesService {
  constructor(
    @InjectRepository(CocktailCategory)
    private readonly categories: Repository<CocktailCategory>,
    @InjectRepository(Cocktail)
    private readonly cocktails: Repository<Cocktail>,
  ) {}

  listPublic() {
    return this.categories.find({
      where: { isActive: true },
      order: { sortOrder: "ASC", createdAt: "ASC" },
    });
  }

  listAdmin() {
    return this.categories.find({
      order: { sortOrder: "ASC", createdAt: "ASC" },
    });
  }

  async create(dto: CreateCocktailCategoryDto) {
    if (await this.categories.exists({ where: { code: dto.code } }))
      throw new ConflictException("Category code already exists");
    return this.categories.save(
      this.categories.create({
        ...dto,
        nameEn: dto.nameEn ?? null,
        description: dto.description ?? null,
        descriptionEn: dto.descriptionEn ?? null,
        iconUrl: dto.iconUrl ?? null,
        sortOrder: dto.sortOrder ?? 0,
        isActive: dto.isActive ?? true,
      }),
    );
  }

  async update(id: string, dto: UpdateCocktailCategoryDto) {
    const category = await this.categories.findOneBy({ id });
    if (!category) throw new NotFoundException("Category not found");
    Object.assign(category, dto);
    return this.categories.save(category);
  }

  async remove(id: string) {
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
    await this.categories.remove(category);
    return { id };
  }
}
