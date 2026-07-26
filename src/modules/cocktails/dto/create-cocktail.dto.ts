import { Transform } from 'class-transformer';
import { IsArray, IsEnum, IsHexColor, IsInt, IsOptional, IsString, IsUrl, Length, Max, Min } from 'class-validator';
import { Spirit, transformSpirit } from '../mappers/spirit.mapper';
import { IsRecipe } from '../validators/recipe-item.validator';
import { RecipeItem } from '../entities/cocktail.entity';
export class CreateCocktailDto {
  @IsString() @Length(1,64) zh!:string;
  @IsOptional() @IsString() @Length(1,128) en='House Original';
  @IsOptional() @Transform(transformSpirit) @IsEnum(Spirit) spirit?:Spirit;
  @IsOptional() @Transform(transformSpirit) @IsEnum(Spirit) base?:Spirit;
  @IsOptional() @IsInt() @Min(0) @Max(99) abv=20;
  @IsOptional() @IsHexColor() color='#0A84FF';
  @IsOptional() @IsArray() @IsString({each:true}) tags=['私藏'];
  @IsOptional() @IsArray() @IsUrl({require_tld:false},{each:true}) images:string[]=[];
  @IsOptional() @IsString() glass='依你所好';
  @IsOptional() @IsString() garnish='自由发挥';
  @IsOptional() @IsString() flavor='来自你自己的酒单。';
  @IsOptional() @IsString() story='这一杯由你定义。';
  @IsRecipe() recipe!:RecipeItem[];
  @IsOptional() @IsArray() @IsString({each:true}) steps:string[]=[];
}
