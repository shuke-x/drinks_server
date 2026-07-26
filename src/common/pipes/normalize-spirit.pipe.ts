import { BadRequestException, Injectable, PipeTransform } from '@nestjs/common'; import { normalizeSpirit } from '../../modules/cocktails/mappers/spirit.mapper';
@Injectable() export class NormalizeSpiritPipe implements PipeTransform { transform(value:unknown){const result=normalizeSpirit(value);if(value && value!=='全部' && !result) throw new BadRequestException('Invalid spirit');return result;} }
