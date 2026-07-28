import { ApiProperty } from "@nestjs/swagger";
import { IsString, MaxLength } from "class-validator";
export class EncryptedAuthDto {
  @ApiProperty({
    description: "从 GET /auth/challenge 获得的一次性 challenge ID",
  })
  @IsString()
  @MaxLength(128)
  challengeId!: string;
  @ApiProperty({
    description:
      "使用 challenge 公钥经 RSA-OAEP SHA-256 加密后再 Base64 编码的凭据 JSON",
  })
  @IsString()
  @MaxLength(8192)
  ciphertext!: string;
}
