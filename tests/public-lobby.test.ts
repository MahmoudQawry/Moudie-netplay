import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const projectRoot = resolve(__dirname, "..");
const readProjectFile = (relativePath: string) => readFileSync(resolve(projectRoot, relativePath), "utf8");

describe("public lobby contract", () => {
  it("exposes the publicList and joinPublic procedures the client calls", () => {
    const routers = readProjectFile("server/routers.ts");
    expect(routers).toContain("publicList: publicProcedure");
    expect(routers).toContain("joinPublic: publicProcedure");
    expect(routers).toContain("room.visibility !== \"public\"");
  });

  it("backs visibility with a database column and migration", () => {
    const schema = readProjectFile("drizzle/schema.ts");
    expect(schema).toContain('mysqlEnum("visibility", ["public", "private"])');
    const migration = readProjectFile("drizzle/0003_public_lobby_visibility.sql");
    expect(migration).toContain("ADD COLUMN `visibility`");
  });

  it("rate-limits unauthenticated room actions", () => {
    const routers = readProjectFile("server/routers.ts");
    expect(routers).toContain("assertRateLimit(ctx.req.ip");
  });

  it("clients request public rooms only through the dedicated service layer", () => {
    const service = readProjectFile("lib/realtime-room-service.ts");
    expect(service).toContain('"rooms.joinPublic"');
    expect(service).toContain('"rooms.publicList"');
  });
});
