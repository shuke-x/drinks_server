import { BadRequestException } from "@nestjs/common";

type SupportedImage = {
  extension: ".jpg" | ".png" | ".webp";
  mimeType: "image/jpeg" | "image/png" | "image/webp";
};

const PNG_SIGNATURE = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
]);

export function inspectImageFile(file: Express.Multer.File): SupportedImage {
  const detected = detectImage(file.buffer);
  if (!detected || detected.mimeType !== file.mimetype.toLowerCase()) {
    throw new BadRequestException("File content is not a valid jpg/png/webp image");
  }
  return detected;
}

function detectImage(buffer: Buffer): SupportedImage | null {
  if (
    buffer.length >= 3 &&
    buffer[0] === 0xff &&
    buffer[1] === 0xd8 &&
    buffer[2] === 0xff
  ) {
    return { extension: ".jpg", mimeType: "image/jpeg" };
  }
  if (
    buffer.length >= PNG_SIGNATURE.length &&
    buffer.subarray(0, PNG_SIGNATURE.length).equals(PNG_SIGNATURE)
  ) {
    return { extension: ".png", mimeType: "image/png" };
  }
  if (
    buffer.length >= 12 &&
    buffer.subarray(0, 4).toString("ascii") === "RIFF" &&
    buffer.subarray(8, 12).toString("ascii") === "WEBP"
  ) {
    return { extension: ".webp", mimeType: "image/webp" };
  }
  return null;
}
