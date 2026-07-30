import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  ManyToOne,
  PrimaryGeneratedColumn,
} from "typeorm";
import { User } from "../../users/entities/user.entity";

@Entity("upload_assets")
export class UploadAsset {
  @PrimaryGeneratedColumn("uuid") id!: string;
  @Index({ unique: true })
  @Column({ type: "varchar", length: 2048 })
  url!: string;
  @Index()
  @ManyToOne(() => User, { onDelete: "CASCADE" })
  owner!: User;
  @CreateDateColumn({ type: "timestamptz" }) createdAt!: Date;
}
