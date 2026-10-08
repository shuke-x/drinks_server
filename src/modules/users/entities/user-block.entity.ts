import { CreateDateColumn, Entity, ManyToOne, PrimaryGeneratedColumn, Unique } from "typeorm";
import { User } from "./user.entity";

@Entity("user_blocks")
@Unique(["blocker", "blocked"])
export class UserBlock {
  @PrimaryGeneratedColumn("uuid") id!: string;
  @ManyToOne(() => User, { onDelete: "CASCADE" }) blocker!: User;
  @ManyToOne(() => User, { onDelete: "CASCADE" }) blocked!: User;
  @CreateDateColumn({ type: "timestamptz" }) createdAt!: Date;
}
