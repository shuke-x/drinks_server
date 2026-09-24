import {
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  Index,
  ManyToOne,
  JoinColumn,
  PrimaryColumn,
  UpdateDateColumn,
} from "typeorm";
import { User } from "../../users/entities/user.entity";
import { CocktailCategory } from "./cocktail-category.entity";
export type RecipeItem = { n: string; ml?: number; t?: string; nEn?: string; tEn?: string };
export enum CocktailStatus {
  DRAFT = "draft",
  PENDING = "pending",
  REJECTED = "rejected",
  PUBLISHED = "published",
  OFFLINE = "offline",
}
@Entity("cocktails")
export class Cocktail {
  @PrimaryColumn({ type: "varchar", length: 32 }) id!: string;
  @Column({ length: 64 }) zh!: string;
  @Column({ length: 128, default: "" }) en!: string;
  /** Public API compatibility field; values are managed by cocktail_categories. */
  @Index() @Column({ type: "varchar", length: 64 }) spirit!: string;
  @ManyToOne(() => CocktailCategory, { nullable: false, onDelete: "RESTRICT" })
  @JoinColumn({ name: "categoryId" })
  category!: CocktailCategory;
  @Column({ type: "smallint", default: 20 }) abv!: number;
  @Column({ length: 9, default: "#0A84FF" }) color!: string;
  @Column({ type: "simple-array", default: "" }) tags!: string[];
  @Column({ type: "jsonb", default: () => "'[]'::jsonb" }) images!: string[];
  @Column({ length: 64, default: "依你所好" }) glass!: string;
  @Column({ length: 128, default: "自由发挥" }) garnish!: string;
  @Column({ length: 255, default: "来自你自己的酒单。" }) flavor!: string;
  @Column({ type: "text", default: "这一杯由你定义。" }) story!: string;
  @Column({ type: "jsonb", default: () => "'[]'::jsonb" })
  recipe!: RecipeItem[];
  @Column({ type: "jsonb", default: () => "'[]'::jsonb" }) steps!: string[];
  @Column({ type: "text", nullable: true }) storyEn!: string | null;
  @Column({ type: "varchar", length: 64, nullable: true }) glassEn!: string | null;
  @Column({ type: "varchar", length: 128, nullable: true }) garnishEn!: string | null;
  @Column({ type: "varchar", length: 255, nullable: true }) flavorEn!: string | null;
  @Column({ type: "jsonb", nullable: true }) tagsEn!: string[] | null;
  @Column({ type: "jsonb", nullable: true }) stepsEn!: string[] | null;
  @Column({ default: true }) isOfficial!: boolean;
  /** Private cocktails are only visible to this owner and never enter public feeds. */
  @Column({ default: false }) isPrivate!: boolean;
  @Index()
  @Column({ type: "enum", enum: CocktailStatus, default: CocktailStatus.DRAFT })
  status!: CocktailStatus;
  @Column({ type: "timestamptz", nullable: true }) submittedAt!: Date | null;
  @Column({ type: "timestamptz", nullable: true }) reviewedAt!: Date | null;
  @Column({ type: "varchar", length: 500, nullable: true })
  rejectReason!: string | null;
  @Column({ type: "timestamptz", nullable: true }) publishedAt!: Date | null;
  @Column({ type: "varchar", length: 500, nullable: true })
  offlineReason!: string | null;
  @Index()
  @ManyToOne(() => User, { nullable: true, onDelete: "SET NULL" })
  owner!: User | null;
  /** Set before a deleted account is detached from a retained public cocktail. */
  @Column({ type: "timestamptz", nullable: true })
  ownerDeletedAt!: Date | null;
  @ManyToOne(() => User, { nullable: true, onDelete: "SET NULL" })
  reviewer!: User | null;
  @CreateDateColumn({ type: "timestamptz" }) createdAt!: Date;
  @UpdateDateColumn({ type: "timestamptz" }) updatedAt!: Date;
  @DeleteDateColumn({ type: "timestamptz", nullable: true })
  deletedAt!: Date | null;
}
