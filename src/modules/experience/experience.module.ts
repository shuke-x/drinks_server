import { RecordSharingService, RecordRetentionService } from './record-sharing.service';
import { User } from '../users/entities/user.entity';
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module';
import { UserRole } from '../admin/entities/user-role.entity';
import { RolePermission } from '../admin/entities/role-permission.entity';
import { PermissionsGuard } from '../admin/guards/permissions.guard';
import { DrinkRecordEntity, FlavorEntity } from './experience.entities';
import { ExperienceService } from './experience.service';
import { RecordsController,FlavorsController,AdminRecordsController,AdminFlavorsController,RecordSharingController,PublicRecordsController } from './experience.controller';
@Module({imports:[AuthModule,TypeOrmModule.forFeature([User,DrinkRecordEntity,FlavorEntity,UserRole,RolePermission])],controllers:[RecordsController,FlavorsController,AdminRecordsController,AdminFlavorsController,RecordSharingController,PublicRecordsController],providers:[ExperienceService,PermissionsGuard,RecordSharingService,RecordRetentionService]})
export class ExperienceModule {}
