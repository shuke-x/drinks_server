import { BadRequestException, ExecutionContext } from "@nestjs/common";
import { firstValueFrom, of } from "rxjs";
import { CocktailLanguageInterceptor } from "./cocktail-language.interceptor";
import { localizeCocktailResponse } from "./mappers/cocktail-language.mapper";

const cocktail = {
  id: "negroni", zh: "内格罗尼", en: "Negroni", spirit: "gin", base: "金酒",
  story: "中文介绍", storyEn: "English story", glass: "古典杯", glassEn: "Rocks glass",
  tags: ["经典"], tagsEn: ["Classic"], steps: ["搅拌"], stepsEn: ["Stir"],
  category: { code: "gin", name: "金酒", nameEn: "Gin", description: "杜松子风味", descriptionEn: "Juniper flavored" },
  recipe: [{ n: "金酒", nEn: "Gin", ml: 30 }, { n: "橙皮", nEn: "Orange peel", t: "1 片", tEn: "1 piece" }],
};

describe("cocktail response language", () => {
  it("keeps response keys identical and leaves shared cached content untouched", () => {
    const before = JSON.stringify(cocktail);
    const english = localizeCocktailResponse(cocktail, "en");
    const chinese = localizeCocktailResponse(cocktail, "zh");
    expect(english).toMatchObject({ zh: "Negroni", story: "English story", tags: ["Classic"], steps: ["Stir"], base: "Gin", category: { name: "Gin" } });
    expect(english.recipe).toEqual([{ n: "Gin", ml: 30 }, { n: "Orange peel", t: "1 piece" }]);
    expect(english.category.description).toBe("Juniper flavored");
    expect(chinese.category.description).toBe("杜松子风味");
    expect(english.category).not.toHaveProperty("descriptionEn");
    expect(chinese.zh).toBe("内格罗尼");
    expect(Object.keys(english)).toEqual(Object.keys(chinese));
    expect(english).not.toHaveProperty("storyEn");
    expect(chinese.recipe[0]).not.toHaveProperty("nEn");
    expect(JSON.stringify(cocktail)).toBe(before);
  });

  it("falls back per field, per whole array and per ingredient", () => {
    const result = localizeCocktailResponse({ ...cocktail, en: "", storyEn: " ", tagsEn: [], stepsEn: [""], recipe: [{ n: "金酒", nEn: "", ml: 30 }, { n: "橙皮", t: "适量", tEn: "" }] }, "en");
    expect(result).toMatchObject({ zh: "内格罗尼", story: "中文介绍", tags: ["经典"], steps: ["搅拌"], recipe: [{ n: "金酒", ml: 30 }, { n: "橙皮", t: "适量" }] });
  });

  it.each([
    { __paged: true, data: [cocktail], meta: { total: 1 } },
    { date: "2026-09-12", items: [cocktail] },
    [{ cocktail, createdAt: new Date() }],
  ])("localizes paginated lists, recommendations and nested favorites", value => {
    const result = localizeCocktailResponse(value, "en");
    expect(JSON.stringify(result)).toContain("English story");
    expect(JSON.stringify(result)).not.toContain('"storyEn"');
  });

  it("preserves revision editing content", () => {
    const latestRevision = { content: cocktail };
    expect(localizeCocktailResponse({ ...cocktail, latestRevision }, "en").latestRevision).toEqual(latestRevision);
  });

  it("defaults to Chinese and rejects invalid query languages", async () => {
    const interceptor = new CocktailLanguageInterceptor();
    const context = (lang?: unknown) => ({ switchToHttp: () => ({ getRequest: () => ({ query: { lang } }) }) }) as ExecutionContext;
    const next = { handle: () => of(cocktail) };
    expect((await firstValueFrom(interceptor.intercept(context(), next))).zh).toBe("内格罗尼");
    expect((await firstValueFrom(interceptor.intercept(context("en"), next))).zh).toBe("Negroni");
    expect(() => interceptor.intercept(context("fr"), next)).toThrow(BadRequestException);
    expect(() => interceptor.intercept(context(["en", "zh"]), next)).toThrow(BadRequestException);
  });
});
