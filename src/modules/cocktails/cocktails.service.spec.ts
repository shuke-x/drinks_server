import { CocktailStatus } from "./entities/cocktail.entity";
import { CocktailsService } from "./cocktails.service";

describe("CocktailsService published revisions", () => {
  const owner = { id: "user-1" };
  const category = { id: "category-1", code: "gin", name: "金酒" };
  const cocktail: any = {
    id: "cocktail-1",
    zh: "线上名称",
    en: "Published",
    spirit: "gin",
    category,
    abv: 20,
    color: "#000000",
    tags: [],
    images: [],
    glass: "杯",
    garnish: "装饰",
    flavor: "风味",
    story: "故事",
    recipe: [{ n: "金酒", ml: 30 }],
    steps: [],
    isOfficial: false,
    isPrivate: false,
    status: CocktailStatus.PUBLISHED,
    owner,
    reviewer: null,
  };

  it("stores edits in a draft revision without changing the live cocktail", async () => {
    const revisions: any = {
      findOne: jest.fn().mockResolvedValue(null),
      create: jest.fn((value) => ({ ...value })),
      save: jest.fn(async (value) => ({ id: "revision-1", ...value })),
    };
    const service = new CocktailsService(
      { findOne: jest.fn().mockResolvedValue({ ...cocktail }) } as any,
      {} as any,
      revisions,
      { findOneBy: jest.fn().mockResolvedValue(owner) } as any,
      {} as any,
      {} as any,
    );
    const result: any = await service.update(
      cocktail.id,
      { zh: "待审核名称" },
      owner.id,
    );
    expect(result.cocktail.zh).toBe("线上名称");
    expect(result.revision.content.zh).toBe("待审核名称");
    expect(result.revision.status).toBe(CocktailStatus.DRAFT);
  });

  it("submits the draft revision while the live cocktail stays published", async () => {
    const revision: any = {
      id: "revision-1",
      status: CocktailStatus.DRAFT,
      rejectReason: null,
    };
    const revisions: any = {
      findOne: jest.fn().mockResolvedValue(revision),
      save: jest.fn(async (value) => value),
    };
    const service = new CocktailsService(
      { findOne: jest.fn().mockResolvedValue({ ...cocktail }) } as any,
      {} as any,
      revisions,
      {} as any,
      {
        create: jest.fn((value) => value),
        save: jest.fn(async (value) => value),
      } as any,
      {} as any,
    );
    const result: any = await service.submit(cocktail.id, owner.id);
    expect(result.cocktail.status).toBe(CocktailStatus.PUBLISHED);
    expect(result.revision.status).toBe(CocktailStatus.PENDING);
  });
});
