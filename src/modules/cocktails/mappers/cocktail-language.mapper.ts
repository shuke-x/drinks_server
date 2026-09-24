export const COCKTAIL_TRANSLATION_FIELDS = [
  "storyEn", "glassEn", "garnishEn", "flavorEn", "tagsEn", "stepsEn",
] as const;

function hasText(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

/** Copy on output: service caches must retain both languages. */
export function localizeCocktailResponse(value: any, lang: "zh" | "en"): any {
  if (Array.isArray(value)) return value.map(item => localizeCocktailResponse(item, lang));
  if (!value || typeof value !== "object" || value instanceof Date || Buffer.isBuffer(value)) return value;
  const result: Record<string, any> = {};
  for (const [key, item] of Object.entries(value)) {
    // Revision content is an editing document, not a localized display record.
    result[key] = key === "revision" || key === "latestRevision"
      ? item : localizeCocktailResponse(item, lang);
  }
  if (typeof value.code === "string" && typeof value.name === "string" && "nameEn" in value) {
    if (lang === "en") {
      if (hasText(value.nameEn)) result.name = value.nameEn;
      if (hasText(value.descriptionEn)) result.description = value.descriptionEn;
    }
    delete result.descriptionEn;
  }
  if (typeof value.zh !== "string" || typeof value.spirit !== "string" || !Array.isArray(value.recipe)) return result;
  for (const field of COCKTAIL_TRANSLATION_FIELDS) {
    const original = field.slice(0, -2);
    const translated = value[field];
    const usable = Array.isArray(translated)
      ? translated.length > 0 && translated.every(hasText) : hasText(translated);
    if (lang === "en" && usable) result[original] = Array.isArray(translated) ? [...translated] : translated;
    delete result[field];
  }
  if (lang === "en") {
    if (hasText(value.en)) result.zh = value.en;
    if ("base" in value) result.base = hasText(value.category?.nameEn)
      ? value.category.nameEn : value.base;
    if (result.category && hasText(value.category?.nameEn)) result.category.name = value.category.nameEn;
  }
  result.recipe = value.recipe.map((item: any) => {
    const { nEn, tEn, ...original } = item;
    if (lang === "en") {
      if (hasText(nEn)) original.n = nEn;
      if (hasText(tEn) && typeof original.t === "string") original.t = tEn;
    }
    return original;
  });
  return result;
}
