import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsString,
  Length,
} from "class-validator";

export class ReplaceDailyRecommendationsDto {
  @IsArray()
  @ArrayMaxSize(4)
  @ArrayUnique()
  @IsString({ each: true })
  @Length(1, 32, { each: true })
  cocktailIds!: string[];
}
