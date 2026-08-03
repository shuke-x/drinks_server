import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from "typeorm";
import { User } from "../../users/entities/user.entity";
import { Cocktail } from "./cocktail.entity";

@Entity("daily_recommendations")
@Index("UQ_daily_recommendations_date_position", ["recommendationDate", "sortOrder"], { unique: true })
@Index("UQ_daily_recommendations_date_cocktail", ["recommendationDate", "cocktail"], { unique: true })
export class DailyRecommendation {
  @PrimaryGeneratedColumn("uuid") id!: string;

  @Index()
  @Column({ type: "date" })
  recommendationDate!: string;

  @ManyToOne(() => Cocktail, { nullable: false, onDelete: "CASCADE" })
  @JoinColumn({ name: "cocktailId" })
  cocktail!: Cocktail;

  @Column({ type: "smallint" })
  sortOrder!: number;

  @ManyToOne(() => User, { nullable: true, onDelete: "SET NULL" })
  @JoinColumn({ name: "createdById" })
  createdBy!: User | null;

  @CreateDateColumn({ type: "timestamptz" }) createdAt!: Date;
  @UpdateDateColumn({ type: "timestamptz" }) updatedAt!: Date;
}
