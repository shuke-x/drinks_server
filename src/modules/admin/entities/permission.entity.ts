import { Column, Entity, Index, PrimaryGeneratedColumn } from "typeorm";

@Entity("permissions")
export class Permission {
  @PrimaryGeneratedColumn("uuid") id!: string;
  @Index({ unique: true }) @Column({ length: 96 }) code!: string;
  @Column({ length: 128 }) name!: string;
}
