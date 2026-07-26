import { Module } from '@nestjs/common'; import { UploadController } from './upload.controller'; import { LocalStorageService } from './local-storage.service'; import { STORAGE } from './storage.provider';
@Module({controllers:[UploadController],providers:[LocalStorageService,{provide:STORAGE,useExisting:LocalStorageService}]}) export class UploadModule{}
