import 'reflect-metadata';
import dataSource from '../config/typeorm.datasource';
import { Cocktail } from '../modules/cocktails/entities/cocktail.entity';
import { normalizeSpirit } from '../modules/cocktails/mappers/spirit.mapper';
import seed from './cocktails.json';
async function run(){
  await dataSource.initialize();
  const repo=dataSource.getRepository(Cocktail);
  for(const raw of seed){
    const spirit=normalizeSpirit(raw.base);
    if(!spirit)throw new Error(`Invalid spirit ${raw.base}`);
    const images:string[]=[];
    await repo.upsert({...raw,images,spirit,isOfficial:true},{conflictPaths:['id'],skipUpdateIfNoValuesChanged:true});
  }
  await dataSource.destroy();
  console.log(`Seeded ${seed.length} cocktails`);
}
void run();
