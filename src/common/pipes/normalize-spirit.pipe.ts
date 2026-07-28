import { Injectable, PipeTransform } from "@nestjs/common";
import { normalizeSpirit } from "../../modules/cocktails/mappers/spirit.mapper";
@Injectable()
export class NormalizeSpiritPipe implements PipeTransform {
  transform(value: unknown) {
    const result = normalizeSpirit(value);
    if (result) return result;
    if (value === undefined || value === null || value === "" || value === "全部")
      return undefined;
    return String(value).trim();
  }
}
