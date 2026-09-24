import { AdminRevisionsService } from "./admin-revisions.service";
import { CocktailStatus } from "../cocktails/entities/cocktail.entity";

describe("AdminRevisionsService", () => {
  it("atomically promotes approved revision content to the live cocktail", async () => {
    const category = { id: "category-1", code: "gin", isActive: true };
    const cocktail: any = {
      id: "cocktail-1",
      zh: "线上名称",
      spirit: "gin",
      category,
      status: CocktailStatus.PUBLISHED,
    };
    const revision: any = {
      id: "revision-1",
      status: CocktailStatus.PENDING,
      cocktail,
      content: { zh: "审核后的名称", spirit: "gin", storyEn: "Approved story", tagsEn: ["Classic"], stepsEn: ["Stir"], recipe: [{ n: "金酒", nEn: "Gin", ml: 30 }] },
    };
    const manager = {
      save: jest.fn(async (_entity: unknown, value?: unknown) => value ?? _entity),
      create: jest.fn((_entity: unknown, value: unknown) => value),
    };
    const service = new AdminRevisionsService(
      { transaction: jest.fn(async (callback) => callback(manager)) } as any,
      { findOne: jest.fn().mockResolvedValue(revision) } as any,
      { findOneBy: jest.fn().mockResolvedValue(category) } as any,
      { findOneBy: jest.fn().mockResolvedValue({ id: "reviewer-1" }) } as any,
      { del: jest.fn().mockResolvedValue(undefined) } as any,
    );

    const result: any = await service.review(
      "reviewer-1",
      cocktail.id,
      revision.id,
      "approve",
    );

    expect(result.cocktail.zh).toBe("审核后的名称");
    expect(result.cocktail).toMatchObject({ storyEn: "Approved story", tagsEn: ["Classic"], stepsEn: ["Stir"], recipe: [{ n: "金酒", nEn: "Gin", ml: 30 }] });
    expect(result.cocktail.status).toBe(CocktailStatus.PUBLISHED);
    expect(result.revision.status).toBe(CocktailStatus.PUBLISHED);
    expect(manager.save).toHaveBeenCalled();
  });
});
