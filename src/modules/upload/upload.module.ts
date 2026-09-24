import { ConfigService } from "@nestjs/config";
import { S3StorageService } from "./s3-storage.service";
import { MediaController } from "./media.controller";
import { MediaAccessService } from "./media-access.service";
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
  controllers: [UploadController, MediaController],
  providers: [
    MediaAccessService,
    { provide: STORAGE, inject: [ConfigService], useFactory: (c:ConfigService) => { const driver=c.get("STORAGE_DRIVER","local"); if(driver!=="local" && driver!=="s3") throw new Error("Unsupported STORAGE_DRIVER"); return driver === "s3" ? new S3StorageService(c) : new LocalStorageService(c); } },
  ],
  exports: [STORAGE, MediaAccessService],
})
export class UploadModule {}
