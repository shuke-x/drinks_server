import { Column, CreateDateColumn, Entity, Index, ManyToOne, PrimaryGeneratedColumn } from "typeorm";
import { User } from "../../users/entities/user.entity";

@Entity("admin_audit_logs")
export class AdminAuditLog {
  @PrimaryGeneratedColumn("uuid") id!: string;
  @ManyToOne(() => User, { nullable: true, onDelete: "SET NULL" }) actor!: User | null;
  @Index() @Column({ length: 96 }) action!: string;
  @Index() @Column({ length: 64 }) targetType!: string;
  @Index() @Column({ length: 64 }) targetId!: string;
  @Column({ type: "jsonb", nullable: true }) before!: object | null;
  @Column({ type: "jsonb", nullable: true }) after!: object | null;
  @CreateDateColumn({ type: "timestamptz" }) createdAt!: Date;
}
