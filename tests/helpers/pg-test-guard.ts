import type { Pool } from "pg";

/** Isolated local test database. Integration tests may not use any other target. */
export const TEST_DATABASE_HOST = "127.0.0.1";
export const TEST_DATABASE_PORT = "54329";
export const TEST_DATABASE_NAME = "mms_test";

const BLOCKED_DATABASES = new Set(["manpower_db"]);
const BLOCKED_SCHEMAS = new Set(["public", "pg_catalog", "information_schema", "pg_toast"]);

export class UnsafeTestDatabaseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UnsafeTestDatabaseError";
  }
}

export type TestSqlPolicy = {
  /** Schemas this test may create, drop, or modify. `public` is never accepted. */
  allowedSchemas: readonly string[];
  /**
   * Unqualified relations allowed in INSERT, UPDATE, DELETE, or TRUNCATE.
   * Use this only for temporary tables or for SQL that already runs with search_path
   * pinned to a test schema. Unqualified DROP TABLE stays refused.
   */
  allowedUnqualifiedRelations?: readonly string[];
};

type QueryTarget = {
  query: (...args: never[]) => unknown;
};

/**
 * Accept only `mms_test` on `127.0.0.1:54329`.
 * This reads the supplied string. It does not read `DATABASE_URL`.
 */
export function assertSafeTestDatabaseUrl(raw: string | undefined): string {
  if (raw === undefined || raw.trim() === "") {
    throw new UnsafeTestDatabaseError("DATABASE_URL_TEST is not set.");
  }
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new UnsafeTestDatabaseError("DATABASE_URL_TEST is malformed.");
  }
  if (url.protocol !== "postgresql:" && url.protocol !== "postgres:") {
    throw new UnsafeTestDatabaseError("DATABASE_URL_TEST is malformed.");
  }
  const database = decodeURIComponent(url.pathname.replace(/^\//, ""));
  if (!database || database.includes("/")) {
    throw new UnsafeTestDatabaseError("DATABASE_URL_TEST is malformed.");
  }
  const target = `${url.hostname}:${url.port}/${database}`;
  if (BLOCKED_DATABASES.has(database.toLowerCase())) {
    throw new UnsafeTestDatabaseError(`Refusing database manpower_db (${target}).`);
  }
  if (url.hostname !== TEST_DATABASE_HOST || url.port !== TEST_DATABASE_PORT || database !== TEST_DATABASE_NAME) {
    throw new UnsafeTestDatabaseError(`Refusing database target ${target}.`);
  }
  const schemaParam = url.searchParams.get("schema");
  if (schemaParam !== null) assertAllowedSchema(schemaParam, { allowedSchemas: [schemaParam] });
  assertSearchPathOptions(url.searchParams.get("options") ?? "");
  return raw;
}

/**
 * Exclusive connection source for PostgreSQL integration tests.
 * `DATABASE_URL` is intentionally not read, even when it names `mms_test`.
 */
export function testDatabaseUrl(env?: { DATABASE_URL_TEST?: string }): string {
  const source = env ?? { DATABASE_URL_TEST: process.env.DATABASE_URL_TEST };
  return assertSafeTestDatabaseUrl(source.DATABASE_URL_TEST);
}

/** Pin search_path to one test schema. The database, host, and port stay on the guarded target. */
export function scopedTestDatabaseUrl(raw: string, schema: string, extraOptions = ""): string {
  assertAllowedSchema(schema, { allowedSchemas: [schema] });
  const safe = assertSafeTestDatabaseUrl(raw);
  const url = new URL(safe);
  const options = [`-c search_path=${schema}`, extraOptions.trim()].filter((part) => part.length > 0).join(" ");
  url.searchParams.set("options", options);
  return assertSafeTestDatabaseUrl(url.toString());
}

/** Reject destructive SQL aimed at `public`, `manpower_db`, or any schema this test does not own. */
export function assertSafeDestructiveSql(sql: string, policy: TestSqlPolicy): void {
  const stripped = stripSql(sql);
  if (/\bmanpower_db\b/i.test(stripped)) {
    throw new UnsafeTestDatabaseError("Refusing SQL that names manpower_db.");
  }
  if (/\bdrop\s+database\b/i.test(stripped)) {
    throw new UnsafeTestDatabaseError("Refusing DROP DATABASE.");
  }
  for (const statement of splitStatements(stripped)) {
    assertStatement(statement, policy);
  }
}

/** Split on semicolons that are outside dollar-quoted PL/pgSQL bodies. */
function splitStatements(sql: string): string[] {
  const parts: string[] = [];
  let start = 0;
  let index = 0;
  while (index < sql.length) {
    if (sql[index] === "$") {
      const tag = readDollarTag(sql, index);
      if (tag !== null) {
        const end = sql.indexOf(tag, index + tag.length);
        if (end >= 0) {
          index = end + tag.length;
          continue;
        }
      }
    }
    if (sql[index] === ";") {
      const part = sql.slice(start, index).trim();
      if (part.length > 0) parts.push(part);
      start = index + 1;
    }
    index += 1;
  }
  const tail = sql.slice(start).trim();
  if (tail.length > 0) parts.push(tail);
  return parts;
}

function readDollarTag(sql: string, index: number): string | null {
  if (sql[index] !== "$") return null;
  let end = index + 1;
  while (end < sql.length && /[A-Za-z0-9_]/.test(sql[end] ?? "")) end += 1;
  if (sql[end] !== "$") return null;
  return sql.slice(index, end + 1);
}

/** Check every string query before it reaches PostgreSQL. */
export function guardPool<T extends QueryTarget>(target: T, policy: TestSqlPolicy): T {
  const original = target.query.bind(target) as (...args: unknown[]) => unknown;
  target.query = ((...args: unknown[]) => {
    const text = queryText(args[0]);
    if (text !== undefined) assertSafeDestructiveSql(text, policy);
    return original(...args);
  }) as T["query"];
  return target;
}

export function guardPgPool(pool: Pool, policy: TestSqlPolicy): Pool {
  return guardPool(pool, policy);
}

function assertSearchPathOptions(options: string): void {
  const paths = [...options.matchAll(/(?:^|\s)-c\s+search_path=([^\s]+)/g)].map((match) => match[1] ?? "");
  if (paths.length > 1) {
    throw new UnsafeTestDatabaseError("Refusing multiple search_path settings on the test connection.");
  }
  if (paths.length === 1) assertAllowedSchema(paths[0], { allowedSchemas: [paths[0]] });
}

function assertStatement(statement: string, policy: TestSqlPolicy): void {
  if (!isMutating(statement)) return;
  if (/\bpublic\s*\./i.test(statement) || /\b(?:drop|create|alter)\s+schema\s+(?:if\s+(?:not\s+)?exists\s+)?public\b/i.test(statement)) {
    throw new UnsafeTestDatabaseError("Refusing public schema destructive SQL.");
  }
  const schemaOp = statement.match(/\b(?:drop|create)\s+schema\s+(?:if\s+(?:not\s+)?exists\s+)?("?)([A-Za-z_][\w]*)\1/i);
  if (schemaOp?.[2]) assertAllowedSchema(schemaOp[2], policy);
  if (/^\s*create\s+(?:temp|temporary)\b/i.test(statement)) {
    assertQualifiers(statement, policy);
    return;
  }
  const dropTable = statement.match(/\bdrop\s+table\s+(?:if\s+exists\s+)?(?:("?)([A-Za-z_][\w]*)\1\s*\.\s*)?("?)([A-Za-z_][\w]*)\3/i);
  if (dropTable) {
    if (!dropTable[2]) throw new UnsafeTestDatabaseError("Refusing unqualified DROP TABLE.");
    assertAllowedSchema(dropTable[2], policy);
  }
  const createTable = statement.match(/\bcreate\s+table\s+(?:if\s+not\s+exists\s+)?(?:("?)([A-Za-z_][\w]*)\1\s*\.\s*)?("?)([A-Za-z_][\w]*)\3/i);
  if (createTable) {
    if (!createTable[2]) throw new UnsafeTestDatabaseError("Refusing unqualified CREATE TABLE.");
    assertAllowedSchema(createTable[2], policy);
  }
  assertQualifiers(statement, policy);
  assertUnqualifiedMutations(statement, policy);
}

function assertQualifiers(statement: string, policy: TestSqlPolicy): void {
  const triggerBodies = dollarQuoteBodies(statement);
  for (const match of statement.matchAll(/\b([A-Za-z_][\w]*)\s*\.\s*[A-Za-z_][\w]*\b/g)) {
    const schema = match[1];
    if (!schema) continue;
    if (isTriggerRecordReference(schema, match.index ?? -1, triggerBodies)) continue;
    assertAllowedSchema(schema, policy);
  }
}

/** `NEW.column` and `OLD.column` inside a PL/pgSQL body are trigger records, not schemas. */
function isTriggerRecordReference(
  qualifier: string,
  index: number,
  bodies: ReadonlyArray<readonly [number, number]>,
): boolean {
  const name = qualifier.toLowerCase();
  if (name !== "new" && name !== "old") return false;
  return bodies.some(([start, end]) => index >= start && index < end);
}

function dollarQuoteBodies(statement: string): Array<[number, number]> {
  const spans: Array<[number, number]> = [];
  const opener = /\$([A-Za-z_][\w]*)?\$/g;
  let match: RegExpExecArray | null;
  while ((match = opener.exec(statement)) !== null) {
    const tag = match[0];
    const start = match.index + tag.length;
    const end = statement.indexOf(tag, start);
    if (end < 0) break;
    spans.push([start, end]);
    opener.lastIndex = end + tag.length;
  }
  return spans;
}

function assertUnqualifiedMutations(statement: string, policy: TestSqlPolicy): void {
  const allowed = new Set(policy.allowedUnqualifiedRelations ?? []);
  const pattern = /\b(?:insert\s+into|delete\s+from|(?<!for\s)update(?!\s+on\b)|truncate(?:\s+table)?)\s+("?)([A-Za-z_][\w]*)\1(?!\w)(?!\s*\.)/gi;
  for (const match of statement.matchAll(pattern)) {
    const name = match[2];
    if (!name || !allowed.has(name)) {
      throw new UnsafeTestDatabaseError(`Refusing unqualified destructive SQL${name ? ` on ${name}` : ""}.`);
    }
  }
  assertUnqualifiedTriggerTargets(statement, allowed);
}

/** `BEFORE UPDATE ON schema.table` is a trigger target. `ON` is not the table. */
function assertUnqualifiedTriggerTargets(statement: string, allowed: Set<string>): void {
  const pattern = /\b(?:before|after|instead\s+of)\s+(?:insert|delete|truncate|update)(?:\s+or\s+(?:insert|delete|truncate|update))*\s+on\s+(?:("?)([A-Za-z_][\w]*)\1\s*\.\s*)?("?)([A-Za-z_][\w]*)\3/gi;
  for (const match of statement.matchAll(pattern)) {
    if (match[2]) continue;
    const relation = match[4];
    if (!relation || !allowed.has(relation)) {
      throw new UnsafeTestDatabaseError(`Refusing unqualified destructive SQL${relation ? ` on ${relation}` : ""}.`);
    }
  }
}

function isMutating(statement: string): boolean {
  if (/\b(insert|delete|truncate|alter|drop|create|grant|revoke|copy|comment|vacuum|reindex|merge)\b/i.test(statement)) return true;
  return /\bupdate\b/i.test(statement.replace(/\bfor\s+update\b/gi, " "));
}

function assertAllowedSchema(schema: string, policy: TestSqlPolicy): void {
  const bare = schema.replace(/"/g, "");
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(bare) || BLOCKED_SCHEMAS.has(bare.toLowerCase()) || !policy.allowedSchemas.includes(bare)) {
    throw new UnsafeTestDatabaseError(`Refusing schema ${bare || "(empty)"}.`);
  }
}

function stripSql(sql: string): string {
  return sql.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/--[^\n]*/g, " ").replace(/'(?:''|[^'])*'/g, "''");
}

function queryText(value: unknown): string | undefined {
  if (typeof value === "string") return value;
  if (value !== null && typeof value === "object" && "text" in value && typeof value.text === "string") return value.text;
  return undefined;
}
