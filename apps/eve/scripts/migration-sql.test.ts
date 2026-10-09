import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { splitSqlStatements } from "./migration-sql.ts";

describe("migration SQL splitting", () => {
  it("separates commands that share a legacy migration breakpoint", async () => {
    const migration = await readFile(join(import.meta.dirname, "../migrations/0015_phone_safety_controls.sql"), "utf8");
    const statements = migration
      .split(/^\s*-- statement-breakpoint\s*$/m)
      .flatMap(splitSqlStatements);

    expect(statements).toHaveLength(16);
    expect(statements.filter((statement) => statement.startsWith("ALTER TABLE agentphone_config"))).toHaveLength(10);
  });

  it("preserves semicolons inside strings, comments, and dollar-quoted bodies", () => {
    const statements = splitSqlStatements(`
      CREATE FUNCTION qualify() RETURNS trigger AS $$
      BEGIN
        NEW.value := 'safe;value';
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;
      -- semicolon; in a comment
      INSERT INTO example(value) VALUES ('one;two');
      /* outer; /* nested; */ still; */ SELECT "semi;colon" FROM example;
    `);

    expect(statements).toHaveLength(3);
    expect(statements[0]).toContain("NEW.value := 'safe;value';");
    expect(statements[1]).toContain("'one;two'");
    expect(statements[2]).toContain('"semi;colon"');
  });
});
