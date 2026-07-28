import { Column, CreateDateColumn, Entity, ManyToOne, PrimaryGeneratedColumn } from "typeorm";
import { User } from "../../users/entities/user.entity";
import { Cocktail, CocktailStatus } from "./cocktail.entity";
@Entity("cocktail_revisions") export class CocktailRevision {
  @PrimaryGeneratedColumn("uuid") id!: string;
  @ManyToOne(() => Cocktail, { onDelete: "CASCADE" }) cocktail!: Cocktail;
  @ManyToOne(() => User, { onDelete: "SET NULL", nullable: true }) author!: User | null;
  @Column({ type: "jsonb" }) content!: object;
  @Column({ type: "enum", enum: CocktailStatus, default: CocktailStatus.DRAFT }) status!: CocktailStatus;
  @Column({ type: "varchar", length: 500, nullable: true }) rejectReason!: string | null;
  @CreateDateColumn({ type: "timestamptz" }) createdAt!: Date;
}
