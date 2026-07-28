import "reflect-metadata";
import dataSource from "../config/typeorm.datasource";
import { Cocktail } from "../modules/cocktails/entities/cocktail.entity";
import { normalizeSpirit } from "../modules/cocktails/mappers/spirit.mapper";
import seed from "./cocktails.json";
import { CocktailCategory } from "../modules/cocktails/entities/cocktail-category.entity";
async function run() {
  await dataSource.initialize();
  const repo = dataSource.getRepository(Cocktail);
  const categories = dataSource.getRepository(CocktailCategory);
  for (const raw of seed) {
    const spirit = normalizeSpirit(raw.base);
    if (!spirit) throw new Error(`Invalid spirit ${raw.base}`);
    const category = await categories.findOneBy({ code: spirit });
    if (!category) throw new Error(`Missing category ${spirit}; run migrations first`);
    const images: string[] = [];
    await repo.upsert(
      { ...raw, images, spirit, category, isOfficial: true },
      { conflictPaths: ["id"], skipUpdateIfNoValuesChanged: true },
    );
  }
  await dataSource.destroy();
  console.log(`Seeded ${seed.length} cocktails`);
}
void run();
