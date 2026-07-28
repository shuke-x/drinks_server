import { ApiProperty } from "@nestjs/swagger";
import { IsString, Length } from "class-validator";
export class FavoriteDto {
  @ApiProperty({ example: "ne", description: "鸡尾酒 ID" })
  @IsString()
  @Length(1, 32)
  cocktailId!: string;
}
