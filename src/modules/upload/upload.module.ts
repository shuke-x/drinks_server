import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { UploadController } from "./upload.controller";
import { LocalStorageService } from "./local-storage.service";
import { STORAGE } from "./storage.provider";
import { AuthModule } from "../auth/auth.module";
import { User } from "../users/entities/user.entity";
@Module({
  imports: [AuthModule, TypeOrmModule.forFeature([User])],
  controllers: [UploadController],
  providers: [
    LocalStorageService,
    { provide: STORAGE, useExisting: LocalStorageService },
  ],
})
export class UploadModule {}
