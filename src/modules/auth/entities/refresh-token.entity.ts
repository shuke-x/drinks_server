import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  ManyToOne,
  PrimaryGeneratedColumn,
} from "typeorm";
import { User } from "../../users/entities/user.entity";

@Entity("refresh_tokens")
export class RefreshToken {
  @PrimaryGeneratedColumn("uuid") id!: string;
  @Index({ unique: true })
  @Column({ type: "char", length: 64 })
  tokenHash!: string;
  @ManyToOne(() => User, (user) => user.refreshTokens, { onDelete: "CASCADE" })
  user!: User;
  @Column({ type: "timestamptz" }) expiresAt!: Date;
  @Column({ type: "timestamptz", nullable: true }) revokedAt!: Date | null;
  @CreateDateColumn({ type: "timestamptz" }) createdAt!: Date;
}
