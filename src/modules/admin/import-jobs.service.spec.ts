import { BadRequestException } from "@nestjs/common";
import { plainToInstance } from "class-transformer";
import { validateSync } from "class-validator";
import * as XLSX from "xlsx";
import { CreateCocktailDto } from "../cocktails/dto/create-cocktail.dto";
import {
  detectImportFormat,
  createImportTemplate,
  normalizeImportRow,
  parseImportRows,
} from "./import-jobs.service";

describe("import job file parsing", () => {
  it("parses a JSON array", () => {
    const rows = parseImportRows(
      Buffer.from(JSON.stringify([{ zh: "测试酒单", spirit: "gin" }])),
      "json",
    );
    expect(rows).toEqual([{ zh: "测试酒单", spirit: "gin" }]);
  });

  it("parses a wrapped JSON payload", () => {
    const rows = parseImportRows(
      Buffer.from(JSON.stringify({ cocktails: [{ zh: "测试酒单" }] })),
      "json",
    );
    expect(rows).toHaveLength(1);
  });

  it("parses the first XLSX worksheet", () => {
    const workbook = XLSX.utils.book_new();
    const sheet = XLSX.utils.json_to_sheet([
      { zh: "测试酒单", spirit: "gin", recipe: '[{"n":"金酒","ml":30}]' },
    ]);
    XLSX.utils.book_append_sheet(workbook, sheet, "cocktails");
    const payload = XLSX.write(workbook, {
      type: "buffer",
      bookType: "xlsx",
    });
    const rows = parseImportRows(payload, "xlsx");
    expect(rows[0].zh).toBe("测试酒单");
  });

  it("rejects unsupported file extensions", () => {
    expect(() =>
      detectImportFormat({
        originalname: "cocktails.csv",
        mimetype: "text/csv",
      } as Express.Multer.File),
    ).toThrow(BadRequestException);
  });

  it("maps the public import columns to the cocktail model", () => {
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

  it("parses human-readable multiline ingredients and numbered steps", () => {
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

  it("generates a readable XLSX template", () => {
    const rows = parseImportRows(createImportTemplate(), "xlsx");
    expect(rows[0]).toHaveProperty("baseSpirit", "gin");
    expect(rows[0]).toHaveProperty("ingredients");
  });
});
