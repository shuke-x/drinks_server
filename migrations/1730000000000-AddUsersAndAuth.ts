import { MigrationInterface, QueryRunner } from "typeorm";

export class AddUsersAndAuth1730000000000 implements MigrationInterface {
  name = "AddUsersAndAuth1730000000000";
  async up(q: QueryRunner) {
    await q.query(
      `CREATE TABLE "users" ("id" uuid NOT NULL,"email" varchar(254) NOT NULL,"passwordHash" text NOT NULL,"name" varchar(64) NOT NULL,"avatarUrl" varchar(2048),"createdAt" timestamptz NOT NULL DEFAULT now(),"updatedAt" timestamptz NOT NULL DEFAULT now(),CONSTRAINT "PK_users" PRIMARY KEY ("id"),CONSTRAINT "UQ_users_email" UNIQUE ("email"))`,
    );
    await q.query(
      `CREATE TABLE "refresh_tokens" ("id" uuid NOT NULL,"tokenHash" char(64) NOT NULL,"expiresAt" timestamptz NOT NULL,"revokedAt" timestamptz,"createdAt" timestamptz NOT NULL DEFAULT now(),"userId" uuid,CONSTRAINT "PK_refresh_tokens" PRIMARY KEY ("id"),CONSTRAINT "UQ_refresh_tokens_hash" UNIQUE ("tokenHash"),CONSTRAINT "FK_refresh_tokens_user" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE)`,
    );
    await q.query(
      `CREATE TABLE "user_favorites" ("id" uuid NOT NULL,"createdAt" timestamptz NOT NULL DEFAULT now(),"userId" uuid,"cocktailId" varchar(32),CONSTRAINT "PK_user_favorites" PRIMARY KEY ("id"),CONSTRAINT "UQ_user_favorites_pair" UNIQUE ("userId","cocktailId"),CONSTRAINT "FK_user_favorites_user" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE,CONSTRAINT "FK_user_favorites_cocktail" FOREIGN KEY ("cocktailId") REFERENCES "cocktails"("id") ON DELETE CASCADE)`,
    );
    await q.query(
      'CREATE INDEX "IDX_refresh_tokens_hash" ON "refresh_tokens" ("tokenHash")',
    );
    await q.query(
      'CREATE INDEX "IDX_user_favorites_user" ON "user_favorites" ("userId")',
    );
  }
  async down(q: QueryRunner) {
    await q.query('DROP TABLE "user_favorites"');
    await q.query('DROP TABLE "refresh_tokens"');
    await q.query('DROP TABLE "users"');
  }
}
