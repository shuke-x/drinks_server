import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from "typeorm";
import { RefreshToken } from "../../auth/entities/refresh-token.entity";
export enum UserStatus {
  ACTIVE = "active",
  DISABLED = "disabled",
}
export enum UserAccountSource {
  APP = "app",
  ADMIN = "admin",
}

@Entity("users")
export class User {
  @PrimaryGeneratedColumn("uuid") id!: string;
  @Index({ unique: true }) @Column({ length: 254 }) email!: string;
  /** Never select or expose this column in API responses. */
  @Column({ type: "text", select: false }) passwordHash!: string;
  @Column({ length: 64 }) name!: string;
  @Column({ type: "enum", enum: UserStatus, default: UserStatus.ACTIVE })
  status!: UserStatus;
  @Column({
    type: "enum",
    enum: UserAccountSource,
    default: UserAccountSource.APP,
  })
  accountSource!: UserAccountSource;
  @Column({ type: "timestamptz", nullable: true }) disabledAt!: Date | null;
  @Column({ type: "varchar", length: 255, nullable: true })
  disabledReason!: string | null;
  @Column({ type: "varchar", length: 2048, nullable: true }) avatarUrl!:
    string | null;
  @Column({ type: "varchar", length: 16, nullable: true })
  language!: string | null;
  @CreateDateColumn({ type: "timestamptz" }) createdAt!: Date;
  @UpdateDateColumn({ type: "timestamptz" }) updatedAt!: Date;
  @OneToMany(() => RefreshToken, (token) => token.user)
  refreshTokens!: RefreshToken[];
}
