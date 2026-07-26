import { Express } from 'express'; export const STORAGE='STORAGE'; export interface StorageProvider { save(file:Express.Multer.File):Promise<string>; }
