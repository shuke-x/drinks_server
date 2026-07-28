import { CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from "typeorm";
import { User } from "../../users/entities/user.entity";
import { Role } from "./role.entity";

@Entity("user_roles")
@Index(["user", "role"], { unique: true })
export class UserRole {
  @PrimaryGeneratedColumn("uuid") id!: string;
  @ManyToOne(() => User, { onDelete: "CASCADE" }) @JoinColumn({ name: "userId" }) user!: User;
  @ManyToOne(() => Role, { onDelete: "CASCADE" }) @JoinColumn({ name: "roleId" }) role!: Role;
  @ManyToOne(() => User, { nullable: true, onDelete: "SET NULL" }) @JoinColumn({ name: "assignedById" }) assignedBy!: User | null;
  @CreateDateColumn({ type: "timestamptz" }) createdAt!: Date;
}
