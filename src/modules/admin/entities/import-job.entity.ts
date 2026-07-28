import { Column, CreateDateColumn, Entity, ManyToOne, PrimaryGeneratedColumn, UpdateDateColumn } from "typeorm";
import { User } from "../../users/entities/user.entity";
export enum ImportJobStatus { PENDING = "pending", PROCESSING = "processing", COMPLETED = "completed", FAILED = "failed" }
@Entity("admin_import_jobs") export class AdminImportJob {
  @PrimaryGeneratedColumn("uuid") id!: string;
  @ManyToOne(() => User, { onDelete: "SET NULL", nullable: true }) creator!: User | null;
  @Column({ length: 8 }) format!: "json" | "xlsx";
  @Column({ type: "enum", enum: ImportJobStatus, default: ImportJobStatus.PENDING }) status!: ImportJobStatus;
  @Column({ type: "jsonb", default: () => "'{}'::jsonb" }) summary!: object;
  @Column({ type: "text", nullable: true }) error!: string | null;
  /** Raw files are only loaded by the worker, never by list/detail APIs. */
  @Column({ type: "bytea", select: false }) payload!: Buffer;
  @CreateDateColumn({ type: "timestamptz" }) createdAt!: Date;
  @UpdateDateColumn({ type: "timestamptz" }) updatedAt!: Date;
}
