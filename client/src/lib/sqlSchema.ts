export type SqlExampleTable = { name: string; columns: string[]; rows: string[][] };

/**
 * Parse LeetCode SQL example schemas (CREATE TABLE / TRUNCATE / INSERT
 * statements) into displayable tables. Best-effort: statements that don't
 * match are skipped; callers should fall back to raw text when [] is returned.
 */
export function parseSqlSchemas(statements: string[]): SqlExampleTable[] {
  const tables = new Map<string, SqlExampleTable>();

  for (const raw of statements) {
    const stmt = raw.trim();

    const create = stmt.match(/^create\s+table\s+(?:if\s+not\s+exists\s+)?`?(\w+)`?\s*\(([\s\S]*)\)\s*$/i);
    if (create) {
      const columns = splitTopLevel(create[2]).map(def => def.trim().split(/\s+/)[0].replace(/`/g, ''));
      tables.set(create[1].toLowerCase(), { name: create[1], columns, rows: [] });
      continue;
    }

    const insert = stmt.match(/^insert\s+into\s+`?(\w+)`?\s*(?:\(([^)]*)\)\s*)?values\s*([\s\S]+)$/i);
    if (insert) {
      const key = insert[1].toLowerCase();
      let table = tables.get(key);
      if (!table) {
        table = { name: insert[1], columns: insert[2] ? splitTopLevel(insert[2]).map(c => c.trim().replace(/`/g, '')) : [], rows: [] };
        tables.set(key, table);
      }
      for (const tuple of extractTuples(insert[3])) {
        table.rows.push(splitTopLevel(tuple).map(formatValue));
      }
    }
    // TRUNCATE and anything else: ignore.
  }

  return Array.from(tables.values());
}

/** Split on top-level commas, respecting parentheses and single quotes. */
function splitTopLevel(input: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let inQuote = false;
  let cur = '';
  for (let i = 0; i < input.length; i++) {
    const ch = input[i];
    if (inQuote) {
      cur += ch;
      if (ch === "'") {
        if (input[i + 1] === "'") { cur += "'"; i++; }
        else inQuote = false;
      }
      continue;
    }
    if (ch === "'") { inQuote = true; cur += ch; }
    else if (ch === '(') { depth++; cur += ch; }
    else if (ch === ')') { depth--; cur += ch; }
    else if (ch === ',' && depth === 0) { parts.push(cur); cur = ''; }
    else cur += ch;
  }
  if (cur.trim()) parts.push(cur);
  return parts;
}

/** Extract the contents of each top-level (...) tuple in a VALUES clause. */
function extractTuples(valuesClause: string): string[] {
  const tuples: string[] = [];
  let depth = 0;
  let inQuote = false;
  let start = -1;
  for (let i = 0; i < valuesClause.length; i++) {
    const ch = valuesClause[i];
    if (inQuote) {
      if (ch === "'") {
        if (valuesClause[i + 1] === "'") i++;
        else inQuote = false;
      }
      continue;
    }
    if (ch === "'") inQuote = true;
    else if (ch === '(') { if (depth === 0) start = i + 1; depth++; }
    else if (ch === ')') {
      depth--;
      if (depth === 0 && start >= 0) { tuples.push(valuesClause.slice(start, i)); start = -1; }
    }
  }
  return tuples;
}

function formatValue(v: string): string {
  const s = v.trim();
  if (/^null$/i.test(s)) return 'null';
  if (s.startsWith("'") && s.endsWith("'")) return s.slice(1, -1).replace(/''/g, "'");
  if (s.startsWith('"') && s.endsWith('"')) return s.slice(1, -1);
  return s;
}
