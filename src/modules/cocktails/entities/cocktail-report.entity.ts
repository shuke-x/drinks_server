import { Column, CreateDateColumn, Entity, ManyToOne, PrimaryGeneratedColumn, Unique } from "typeorm";
import { User } from "../../users/entities/user.entity";
import { Cocktail } from "./cocktail.entity";

export enum CocktailReportStatus { OPEN = "open", REVIEWED = "reviewed", DISMISSED = "dismissed" }

@Entity("cocktail_reports")
@Unique(["reporter", "cocktail"])
export class CocktailReport {
  @PrimaryGeneratedColumn("uuid") id!: string;
  @ManyToOne(() => User, { onDelete: "CASCADE" }) reporter!: User;
  @ManyToOne(() => Cocktail, { onDelete: "CASCADE" }) cocktail!: Cocktail;
  @Column({ type: "varchar", length: 64 }) reason!: string;
  @Column({ type: "varchar", length: 2000, nullable: true }) details!: string | null;
  @Column({ type: "enum", enum: CocktailReportStatus, default: CocktailReportStatus.OPEN }) status!: CocktailReportStatus;
  @CreateDateColumn({ type: "timestamptz" }) createdAt!: Date;
}
