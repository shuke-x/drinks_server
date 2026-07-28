import { Transform } from "class-transformer";
import {
  IsArray,
  IsBoolean,
  IsHexColor,
  IsInt,
  IsOptional,
  IsString,
  IsUrl,
  Length,
  Max,
  Min,
} from "class-validator";
import { transformSpirit } from "../mappers/spirit.mapper";
import { IsRecipe } from "../validators/recipe-item.validator";
import { RecipeItem } from "../entities/cocktail.entity";
export class CreateCocktailDto {
  /** Private cocktails remain drafts and cannot be submitted for public review. */
  @IsOptional() @IsBoolean() isPrivate?: boolean;
  @IsString() @Length(1, 64) zh!: string;
  @IsOptional() @IsString() @Length(1, 128) en = "House Original";
  @IsOptional() @Transform(transformSpirit) @IsString() @Length(1, 64) spirit?: string;
  @IsOptional() @Transform(transformSpirit) @IsString() @Length(1, 64) base?: string;
  @IsOptional() @IsInt() @Min(0) @Max(99) abv = 20;
  @IsOptional() @IsHexColor() color = "#0A84FF";
  @IsOptional() @IsArray() @IsString({ each: true }) tags = ["私藏"];
  @IsOptional()
  @IsArray()
  @IsUrl({ require_tld: false }, { each: true })
  images: string[] = [];
  @IsOptional() @IsString() glass = "依你所好";
  @IsOptional() @IsString() garnish = "自由发挥";
  @IsOptional() @IsString() flavor = "来自你自己的酒单。";
  @IsOptional() @IsString() story = "这一杯由你定义。";
  @IsRecipe() recipe!: RecipeItem[];
  @IsOptional() @IsArray() @IsString({ each: true }) steps: string[] = [];
}
