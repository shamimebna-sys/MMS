export type DumpRow = (string | null)[];

export type DumpStatementHandler = {
  onRow: (table: string, columns: string[], row: DumpRow) => void | Promise<void>;
  onStatementEnd?: (table: string) => void | Promise<void>;
};

const MARKER = "INSERT INTO `";

function unescapeSql(char: string): string {
  switch (char) {
    case "0":
      return "\u0000";
    case "n":
      return "\n";
    case "r":
      return "\r";
    case "t":
      return "\t";
    case "Z":
      return "\u001a";
    default:
      return char;
  }
}

/**
 * Streaming parser for phpMyAdmin MariaDB dumps.
 * Rows are emitted one at a time so the caller can batch inserts.
 */
export class SqlDumpScanner {
  private buf = "";
  private index = 0;
  private mode: "seek" | "header" | "values" = "seek";
  private table = "";
  private columns: string[] = [];
  private inTuple = false;
  private inString = false;
  private escape = false;
  private stringValue = "";
  private token = "";
  private readingToken = false;
  private row: DumpRow = [];
  private expectValue = true;

  constructor(private readonly handler: DumpStatementHandler) {}

  async push(chunk: string): Promise<void> {
    this.buf += chunk;
    await this.drain();
  }

  async finish(): Promise<void> {
    await this.drain();
    if (this.mode !== "seek" || this.inString || this.inTuple) {
      throw new Error("Legacy dump ended before the current INSERT statement finished.");
    }
  }

  private async drain(): Promise<void> {
    while (this.index < this.buf.length) {
      if (this.mode === "seek") {
        const rest = this.buf.slice(this.index);
        const found = rest.indexOf(MARKER);
        if (found === -1) {
          const keep = Math.min(rest.length, MARKER.length - 1);
          this.buf = rest.slice(rest.length - keep);
          this.index = 0;
          return;
        }
        this.buf = rest.slice(found);
        this.index = 0;
        this.mode = "header";
      }

      if (this.mode === "header") {
        const rest = this.buf.slice(this.index);
        const valuesAt = rest.indexOf("VALUES");
        if (valuesAt === -1) return;
        const header = rest.slice(0, valuesAt);
        const names = [...header.matchAll(/`([^`]+)`/g)].map((match) => match[1]);
        if (!names[0]) throw new Error("INSERT statement is missing a table name.");
        this.table = names[0];
        this.columns = names.slice(1);
        this.index += valuesAt + "VALUES".length;
        this.mode = "values";
        this.inTuple = false;
        this.expectValue = true;
        this.row = [];
        continue;
      }

      const consumed = await this.consumeValues();
      if (!consumed) return;
    }
    this.compact();
  }

  private compact(): void {
    if (this.index > 1_000_000) {
      this.buf = this.buf.slice(this.index);
      this.index = 0;
    }
  }

  private async consumeValues(): Promise<boolean> {
    while (this.index < this.buf.length) {
      const char = this.buf[this.index];

      if (this.inString) {
        this.index += 1;
        if (this.escape) {
          this.stringValue += unescapeSql(char);
          this.escape = false;
          continue;
        }
        if (char === "\\") {
          this.escape = true;
          continue;
        }
        if (char === "'") {
          if (this.buf[this.index] === "'") {
            this.stringValue += "'";
            this.index += 1;
            continue;
          }
          this.inString = false;
          this.row.push(this.stringValue);
          this.stringValue = "";
          this.expectValue = false;
          continue;
        }
        this.stringValue += char;
        continue;
      }

      if (this.readingToken) {
        if (/[\s,);]/.test(char)) {
          this.row.push(this.token.toUpperCase() === "NULL" ? null : this.token);
          this.token = "";
          this.readingToken = false;
          this.expectValue = false;
          continue;
        }
        this.token += char;
        this.index += 1;
        continue;
      }

      if (/\s/.test(char)) {
        this.index += 1;
        continue;
      }

      if (!this.inTuple) {
        if (char === "(") {
          this.inTuple = true;
          this.expectValue = true;
          this.row = [];
          this.index += 1;
          continue;
        }
        if (char === ";") {
          const table = this.table;
          this.mode = "seek";
          this.index += 1;
          this.compact();
          await this.handler.onStatementEnd?.(table);
          return true;
        }
        if (char === ",") {
          this.index += 1;
          continue;
        }
        throw new Error(`Unexpected character ${JSON.stringify(char)} before a row in ${this.table}.`);
      }

      if (this.expectValue) {
        if (char === "'") {
          this.inString = true;
          this.stringValue = "";
          this.index += 1;
          continue;
        }
        if (char === ")") {
          throw new Error(`Unexpected end of row in ${this.table}.`);
        }
        this.readingToken = true;
        this.token = char;
        this.index += 1;
        continue;
      }

      if (char === ",") {
        this.expectValue = true;
        this.index += 1;
        continue;
      }

      if (char === ")") {
        if (this.row.length !== this.columns.length) {
          throw new Error(
            `Column count mismatch in ${this.table}: expected ${this.columns.length}, received ${this.row.length}.`,
          );
        }
        this.inTuple = false;
        this.index += 1;
        this.compact();
        await this.handler.onRow(this.table, this.columns, this.row);
        this.row = [];
        continue;
      }

      throw new Error(`Unexpected character ${JSON.stringify(char)} while reading ${this.table}.`);
    }
    return false;
  }
}

export async function parseDump(sql: string): Promise<Array<{ table: string; columns: string[]; rows: DumpRow[] }>> {
  const statements: Array<{ table: string; columns: string[]; rows: DumpRow[] }> = [];
  let current: { table: string; columns: string[]; rows: DumpRow[] } | null = null;
  const scanner = new SqlDumpScanner({
    onRow: (table, columns, row) => {
      if (!current || current.table !== table) {
        current = { table, columns, rows: [] };
        statements.push(current);
      }
      current.rows.push(row);
    },
  });
  await scanner.push(sql);
  await scanner.finish();
  return statements;
}
