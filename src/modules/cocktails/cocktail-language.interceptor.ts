import { BadRequestException, CallHandler, ExecutionContext, Injectable, NestInterceptor } from "@nestjs/common";
import { map } from "rxjs";
import { localizeCocktailResponse } from "./mappers/cocktail-language.mapper";

@Injectable()
export class CocktailLanguageInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler) {
    const lang = context.switchToHttp().getRequest().query?.lang ?? "zh";
    if (lang !== "zh" && lang !== "en") throw new BadRequestException("lang must be zh or en");
    return next.handle().pipe(map(value => localizeCocktailResponse(value, lang)));
  }
}
