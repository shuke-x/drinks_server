import { IsArray, IsOptional, IsString, MaxLength } from "class-validator";

export class CocktailTranslationsDto {
  @IsOptional() @IsString() storyEn?: string | null;
  @IsOptional() @IsString() @MaxLength(64) glassEn?: string | null;
  @IsOptional() @IsString() @MaxLength(128) garnishEn?: string | null;
  @IsOptional() @IsString() @MaxLength(255) flavorEn?: string | null;
  @IsOptional() @IsArray() @IsString({ each: true }) tagsEn?: string[] | null;
  @IsOptional() @IsArray() @IsString({ each: true }) stepsEn?: string[] | null;
}
