import {
  CallHandler,
  StreamableFile,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from "@nestjs/common";
import { MediaAccessService } from "../../modules/upload/media-access.service";
import { map, Observable } from "rxjs";
@Injectable()
export class ResponseInterceptor implements NestInterceptor {
  constructor(private readonly media?:MediaAccessService) {}
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    return next.handle().pipe(
      map((value: any) => {
        if(value instanceof StreamableFile) return value;
        if(this.media) value=this.media.map(value,context.switchToHttp().getRequest().authUser?.id);
        if (value?.__paged)
          return { code: 0, message: "ok", data: value.data, meta: value.meta };
        return { code: 0, message: "ok", data: value ?? null };
      }),
    );
  }
}
