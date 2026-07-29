import { BadRequestException } from "@nestjs/common";
import { inspectImageFile } from "./image-file.validator";

const file = (buffer: Buffer, mimetype: string) =>
  ({ buffer, mimetype }) as Express.Multer.File;

describe("inspectImageFile", () => {
  it.each([
    [Buffer.from([0xff, 0xd8, 0xff, 0x00]), "image/jpeg", ".jpg"],
    [
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      "image/png",
      ".png",
    ],
    [Buffer.from("RIFF0000WEBP", "ascii"), "image/webp", ".webp"],
  ])("accepts a valid image signature", (buffer, mimetype, extension) => {
    expect(inspectImageFile(file(buffer, mimetype))).toEqual({
      extension,
      mimeType: mimetype,
    });
  });

  it("rejects a MIME type that does not match the bytes", () => {
    expect(() =>
      inspectImageFile(file(Buffer.from([0xff, 0xd8, 0xff]), "image/png")),
    ).toThrow(BadRequestException);
  });

  it("rejects non-image content with a forged MIME type", () => {
    expect(() =>
      inspectImageFile(file(Buffer.from("<html>not an image</html>"), "image/jpeg")),
    ).toThrow(BadRequestException);
  });
});
