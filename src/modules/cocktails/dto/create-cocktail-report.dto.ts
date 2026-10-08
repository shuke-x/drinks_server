import { IsIn, IsOptional, IsString, MaxLength } from "class-validator";

export class CreateCocktailReportDto {
  @IsString()
  @IsIn(["harassment", "hate", "sexual", "dangerous", "privacy", "copyright", "spam", "other"])
  reason!: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  details?: string;
}
