import { IsIn } from "class-validator";

export class UpdateCocktailReportStatusDto {
  @IsIn(["reviewed", "dismissed"])
  status!: "reviewed" | "dismissed";
}
