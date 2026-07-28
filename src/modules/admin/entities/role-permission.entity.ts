import { Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from "typeorm";
import { Permission } from "./permission.entity";
import { Role } from "./role.entity";

@Entity("role_permissions")
@Index(["role", "permission"], { unique: true })
export class RolePermission {
  @PrimaryGeneratedColumn("uuid") id!: string;
  @ManyToOne(() => Role, { onDelete: "CASCADE" }) @JoinColumn({ name: "roleId" }) role!: Role;
  @ManyToOne(() => Permission, { onDelete: "CASCADE" }) @JoinColumn({ name: "permissionId" }) permission!: Permission;
}
