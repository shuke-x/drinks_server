import { Column, CreateDateColumn, Entity, ManyToOne, PrimaryGeneratedColumn } from "typeorm";
import { User } from "../../users/entities/user.entity";
import { Cocktail, CocktailStatus } from "./cocktail.entity";

@Entity("cocktail_review_logs")
export class CocktailReviewLog {
  @PrimaryGeneratedColumn("uuid") id!: string;
  @ManyToOne(() => Cocktail, { onDelete: "CASCADE" }) cocktail!: Cocktail;
  @Column({ length: 32 }) action!: string;
  @Column({ type: "enum", enum: CocktailStatus, nullable: true }) fromStatus!: CocktailStatus | null;
  @Column({ type: "enum", enum: CocktailStatus, nullable: true }) toStatus!: CocktailStatus | null;
  @ManyToOne(() => User, { nullable: true, onDelete: "SET NULL" }) reviewer!: User | null;
  @Column({ type: "varchar", length: 500, nullable: true }) reason!: string | null;
  @CreateDateColumn({ type: "timestamptz" }) createdAt!: Date;
}
