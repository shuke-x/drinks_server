import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from "typeorm";

@Entity("cocktail_categories")
export class CocktailCategory {
  @PrimaryGeneratedColumn("uuid") id!: string;
  @Index({ unique: true }) @Column({ length: 64 }) code!: string;
  @Column({ length: 64 }) name!: string;
  @Column({ type: "varchar", length: 128, nullable: true })
  nameEn!: string | null;
  @Column({ type: "text", nullable: true }) description!: string | null;
  @Column({ type: "varchar", length: 2048, nullable: true }) iconUrl!: string | null;
  @Column({ type: "int", default: 0 }) sortOrder!: number;
  @Column({ default: true }) isActive!: boolean;
  @CreateDateColumn({ type: "timestamptz" }) createdAt!: Date;
  @UpdateDateColumn({ type: "timestamptz" }) updatedAt!: Date;
}
