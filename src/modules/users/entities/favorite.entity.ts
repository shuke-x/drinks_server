import {
  CreateDateColumn,
  Entity,
  Index,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
} from "typeorm";
import { Cocktail } from "../../cocktails/entities/cocktail.entity";
import { User } from "./user.entity";

@Entity("user_favorites")
@Unique(["user", "cocktail"])
export class Favorite {
  @PrimaryGeneratedColumn("uuid") id!: string;
  @Index() @ManyToOne(() => User, { onDelete: "CASCADE" }) user!: User;
  @ManyToOne(() => Cocktail, { onDelete: "CASCADE" }) cocktail!: Cocktail;
  @CreateDateColumn({ type: "timestamptz" }) createdAt!: Date;
}
