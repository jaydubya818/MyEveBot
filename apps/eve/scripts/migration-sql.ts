type SqlMode = "normal" | "single" | "double" | "line-comment" | "block-comment" | "dollar";

/**
 * Split migration SQL into statements without breaking quoted strings,
 * identifiers, comments, or PostgreSQL dollar-quoted function bodies.
 * Neon executes prepared statements and therefore rejects multiple commands in
 * a single query, even when PostgreSQL's simple-query protocol would accept it.
 */
export function splitSqlStatements(source: string): string[] {
  const statements: string[] = [];
  let start = 0;
  let index = 0;
  let mode: SqlMode = "normal";
  let dollarTag = "";
  let blockDepth = 0;

  const push = (end: number) => {
    const statement = source.slice(start, end).trim();
    if (statement) statements.push(statement);
    start = end + 1;
  };

  while (index < source.length) {
    const current = source[index];
    const next = source[index + 1];

    if (mode === "single") {
      if (current === "'" && next === "'") index += 2;
      else if (current === "'") { mode = "normal"; index += 1; }
      else index += 1;
      continue;
    }
    if (mode === "double") {
      if (current === '"' && next === '"') index += 2;
      else if (current === '"') { mode = "normal"; index += 1; }
      else index += 1;
      continue;
    }
    if (mode === "line-comment") {
      if (current === "\n") mode = "normal";
      index += 1;
      continue;
    }
    if (mode === "block-comment") {
      if (current === "/" && next === "*") { blockDepth += 1; index += 2; }
      else if (current === "*" && next === "/") {
        blockDepth -= 1;
        index += 2;
        if (blockDepth === 0) mode = "normal";
      } else index += 1;
      continue;
    }
    if (mode === "dollar") {
      if (source.startsWith(dollarTag, index)) {
        index += dollarTag.length;
        mode = "normal";
      } else index += 1;
      continue;
    }

    if (current === "'") { mode = "single"; index += 1; continue; }
    if (current === '"') { mode = "double"; index += 1; continue; }
    if (current === "-" && next === "-") { mode = "line-comment"; index += 2; continue; }
    if (current === "/" && next === "*") { mode = "block-comment"; blockDepth = 1; index += 2; continue; }
    if (current === "$") {
      const match = source.slice(index).match(/^\$[A-Za-z_][A-Za-z0-9_]*\$|^\$\$/);
      if (match) {
        dollarTag = match[0];
        mode = "dollar";
        index += dollarTag.length;
        continue;
      }
    }
    if (current === ";") { push(index); index += 1; continue; }
    index += 1;
  }

  const trailing = source.slice(start).trim();
  if (trailing) statements.push(trailing);
  return statements;
}
