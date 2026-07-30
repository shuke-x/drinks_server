import { Express } from "express";
export const STORAGE = "STORAGE";

export type ImagePurpose = "avatar" | "cocktail";

export type SaveImageOptions = {
  purpose?: ImagePurpose;
};

export interface StorageProvider {
  save(
    file: Express.Multer.File,
    options?: SaveImageOptions,
  ): Promise<string>;
  remove(url: string): Promise<void>;
}
