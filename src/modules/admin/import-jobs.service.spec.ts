import { BadRequestException } from "@nestjs/common";
import { plainToInstance } from "class-transformer";
import { validateSync } from "class-validator";
import ExcelJS from "exceljs";
import { CreateCocktailDto } from "../cocktails/dto/create-cocktail.dto";
import {
  detectImportFormat,
  createImportTemplate,
  normalizeImportRow,
  parseImportRows,
} from "./import-jobs.service";

describe("import job file parsing", () => {
  it("parses a JSON array", async () => {
    const rows = await parseImportRows(
      Buffer.from(JSON.stringify([{ zh: "测试酒单", spirit: "gin" }])),
      "json",
    );
    expect(rows).toEqual([{ zh: "测试酒单", spirit: "gin" }]);
  });

  it("parses a wrapped JSON payload", async () => {
    const rows = await parseImportRows(
      Buffer.from(JSON.stringify({ cocktails: [{ zh: "测试酒单" }] })),
      "json",
    );
    expect(rows).toHaveLength(1);
  });

  it("parses the first XLSX worksheet", async () => {
    const workbook=new ExcelJS.Workbook();const sheet=workbook.addWorksheet('cocktails');
    sheet.addRow(['zh','spirit','recipe']);sheet.addRow(['测试酒单','gin','[{"n":"金酒","ml":30}]']);
    const payload=Buffer.from(await workbook.xlsx.writeBuffer());
    const rows = await parseImportRows(payload, "xlsx");
    expect(rows[0].zh).toBe("测试酒单");
  });

  it("rejects unsupported file extensions", async () => {
    expect(() =>
      detectImportFormat({
        originalname: "cocktails.csv",
        mimetype: "text/csv",
      } as Express.Multer.File),
    ).toThrow(BadRequestException);
  });

  it("maps the public import columns to the cocktail model", async () => {
    expect(
      normalizeImportRow({
        name: "内格罗尼",
        nameEn: "Negroni",
        baseSpirit: "金酒",
        ingredients: '[{"name":"金酒","amount":30,"unit":"ml"}]',
        imageUrl: "https://example.com/image.webp",
        isPrivate: "是",
      }),
    ).toMatchObject({
      zh: "内格罗尼",
      en: "Negroni",
      spirit: "gin",
      recipe: [{ n: "金酒", ml: 30 }],
      images: ["https://example.com/image.webp"],
      isPrivate: true,
    });
  });

  it("parses human-readable multiline ingredients and numbered steps", async () => {
    const normalized = normalizeImportRow({
      name: "最后一语",
      baseSpirit: "Gin",
      ingredients:
        "金酒 22.5 ml\n青绿查特酒 22.5 ml\n樱桃 1 颗\n糖浆 5 ml（按口味）",
      steps: "1. 全部材料加冰摇匀。\n2. 双重过滤至冰镇杯。",
      tags: "经典,草本，酸甜",
      isPrivate: "FALSE",
    });

    expect(normalized).toMatchObject({
      zh: "最后一语",
      spirit: "gin",
      recipe: [
        { n: "金酒", ml: 22.5 },
        { n: "青绿查特酒", ml: 22.5 },
        { n: "樱桃", t: "1 颗" },
        { n: "糖浆", t: "5 ml（按口味）" },
      ],
      steps: ["全部材料加冰摇匀。", "双重过滤至冰镇杯。"],
      tags: ["经典", "草本", "酸甜"],
      isPrivate: false,
    });

    expect(
      validateSync(plainToInstance(CreateCocktailDto, normalized)),
    ).toEqual([]);
  });

  it("generates a readable XLSX template", async () => {
    const rows = await parseImportRows(await createImportTemplate(), "xlsx");
    expect(rows[0]).toHaveProperty("baseSpirit", "gin");
    expect(rows[0]).toHaveProperty("ingredients");
    const normalized = normalizeImportRow(rows[0]);
    expect(normalized).toMatchObject({ storyEn: "A classic bittersweet cocktail.", tagsEn: ["Bittersweet", "Classic"], recipe: [{ n: "金酒", nEn: "Gin", ml: 30 }, { n: "金巴利", nEn: "Campari", ml: 30 }, { n: "甜味美思", nEn: "Sweet vermouth", ml: 30 }] });
    expect(validateSync(plainToInstance(CreateCocktailDto, normalized), { whitelist: true, forbidNonWhitelisted: true })).toEqual([]);
  });

  it("accepts legacy sheets and empty English cells with strict validation", () => {
    const normalized = normalizeImportRow({ name: "测试", nameEn: "", baseSpirit: "gin", ingredients: '[{"name":"金酒","amount":30,"unit":"ml"}]', descriptionEn: "", tagsEn: "", stepsEn: "" });
    expect(validateSync(plainToInstance(CreateCocktailDto, normalized), { whitelist: true, forbidNonWhitelisted: true })).toEqual([]);
  });

  it("preserves translated text amounts and rejects invalid ingredient translations", () => {
    const normalized = normalizeImportRow({ name: "测试", baseSpirit: "gin", ingredients: '[{"name":"橙皮","nameEn":"Orange peel","amount":1,"unit":"片","amountTextEn":"1 piece"}]', stepsEn: "1. Add ice.\n2. Stir." });
    expect(normalized.recipe).toEqual([{ n: "橙皮", nEn: "Orange peel", t: "1 片", tEn: "1 piece" }]);
    expect(normalized.stepsEn).toEqual(["Add ice.", "Stir."]);
    expect(validateSync(plainToInstance(CreateCocktailDto, { ...normalized, recipe: [{ n: "金酒", ml: 30, nEn: 123 }] }))).not.toEqual([]);
  });
});

it('rejects formula cells and oversized input before import',async()=>{
 const workbook=new ExcelJS.Workbook();const sheet=workbook.addWorksheet('cocktails');
 sheet.addRow(['zh']);sheet.addRow([{formula:'1+1',result:2}]);
 await expect(parseImportRows(Buffer.from(await workbook.xlsx.writeBuffer()),'xlsx')).rejects.toThrow();
 await expect(parseImportRows(Buffer.alloc(10*1024*1024+1),'json')).rejects.toThrow('10 MB');
});
