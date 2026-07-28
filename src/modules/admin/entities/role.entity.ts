import { Column, Entity, Index, PrimaryGeneratedColumn } from "typeorm";

@Entity("roles")
export class Role {
  @PrimaryGeneratedColumn("uuid") id!: string;
  @Index({ unique: true }) @Column({ length: 64 }) code!: string;
  @Column({ length: 128 }) name!: string;
  @Column({ type: "text", nullable: true }) description!: string | null;
  @Column({ default: true }) isSystem!: boolean;
}
