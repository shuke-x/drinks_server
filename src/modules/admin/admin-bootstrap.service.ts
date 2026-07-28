import { Injectable, OnModuleInit } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { User } from "../users/entities/user.entity";
import { Role } from "./entities/role.entity";
import { UserRole } from "./entities/user-role.entity";

/** Explicit deployment-time bootstrap; it never promotes the first registered user. */
@Injectable()
export class AdminBootstrapService implements OnModuleInit {
  constructor(private readonly config: ConfigService, @InjectRepository(User) private readonly users: Repository<User>, @InjectRepository(Role) private readonly roles: Repository<Role>, @InjectRepository(UserRole) private readonly userRoles: Repository<UserRole>) {}
  async onModuleInit() {
    const email = this.config.get<string>("ADMIN_BOOTSTRAP_EMAIL")?.trim().toLowerCase();
    if (!email) return;
    const [user, role] = await Promise.all([this.users.findOneBy({ email }), this.roles.findOneBy({ code: "super_admin" })]);
    if (!user || !role) return;
    if (!(await this.userRoles.exists({ where: { user: { id: user.id }, role: { id: role.id } } }))) await this.userRoles.save(this.userRoles.create({ user, role, assignedBy: null }));
  }
}
