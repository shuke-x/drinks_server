import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { map, Observable } from 'rxjs';
@Injectable() export class ResponseInterceptor implements NestInterceptor { intercept(_: ExecutionContext, next: CallHandler): Observable<unknown> { return next.handle().pipe(map((value: any) => { if (value?.__paged) return { code:0,message:'ok',data:value.data,meta:value.meta }; return {code:0,message:'ok',data:value ?? null}; })); } }
