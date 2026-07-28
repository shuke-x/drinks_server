import { BadRequestException } from "@nestjs/common";
import * as XLSX from "xlsx";
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

  it("generates a readable XLSX template", () => {
    const rows = parseImportRows(createImportTemplate(), "xlsx");
    expect(rows[0]).toHaveProperty("baseSpirit", "gin");
    expect(rows[0]).toHaveProperty("ingredients");
  });
});
