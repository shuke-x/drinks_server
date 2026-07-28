import { TransformFnParams } from "class-transformer";
export enum Spirit {
  GIN = "gin",
  WHISKEY = "whiskey",
  RUM = "rum",
  TEQUILA = "tequila",
  VODKA = "vodka",
  OTHER = "other",
}
const zh: Record<Spirit, string> = {
  gin: "金酒",
  whiskey: "威士忌",
  rum: "朗姆",
  tequila: "龙舌兰",
  vodka: "伏特加",
  other: "其他",
};
const aliases: Record<string, Spirit> = {
  ...Object.fromEntries(Object.entries(zh).map(([k, v]) => [v, k as Spirit])),
  gin: Spirit.GIN,
  whiskey: Spirit.WHISKEY,
  rum: Spirit.RUM,
  tequila: Spirit.TEQUILA,
  vodka: Spirit.VODKA,
  other: Spirit.OTHER,
};
export const spiritToBase = (v: Spirit) => zh[v];
export function normalizeSpirit(value: unknown): Spirit | undefined {
  if (value === undefined || value === null || value === "" || value === "全部")
    return undefined;
  return aliases[String(value).trim().toLowerCase()];
}
export const transformSpirit = ({ value }: TransformFnParams) =>
  value === "全部" || value === ""
    ? undefined
    : (normalizeSpirit(value) ?? value);
