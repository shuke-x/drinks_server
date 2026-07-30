import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { UploadController } from "./upload.controller";
import { LocalStorageService } from "./local-storage.service";
import { STORAGE } from "./storage.provider";
import { AuthModule } from "../auth/auth.module";
import { User } from "../users/entities/user.entity";
import { UploadAsset } from "./entities/upload-asset.entity";
@Module({
  imports: [AuthModule, TypeOrmModule.forFeature([User, UploadAsset])],
  controllers: [UploadController],
  providers: [
    LocalStorageService,
    { provide: STORAGE, useExisting: LocalStorageService },
  ],
  exports: [STORAGE],
})
export class UploadModule {}
