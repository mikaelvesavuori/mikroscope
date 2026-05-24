import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";

import type {
  IndexedLogEntry,
  LogAggregateBucket,
  LogAggregateGroupBy,
  LogCursor,
  LogQueryOptions,
} from "../../interfaces/index.js";

type UpsertEntryInput = {
  timestamp: string;
  level: string;
  event: string;
  message: string;
  isAudit: boolean;
  dataJson: string;
  sourceFile: string;
  lineNumber: number;
};

type UpsertEntryResult = {
  entryId: number;
  inserted: boolean;
};

export type PruneResult = {
  normalCutoffIso: string;
  auditCutoffIso: string;
  normalEntriesDeleted: number;
  auditEntriesDeleted: number;
  entriesDeleted: number;
  fieldsDeleted: number;
};

export type DatabaseStats = {
  entryCount: number;
  fieldCount: number;
  pageCount: number;
  pageSize: number;
  approximateSizeBytes: number;
};

export type ResetResult = {
  entriesDeleted: number;
  fieldsDeleted: number;
};

export type DeleteBySourceFileResult = {
  entriesDeleted: number;
  fieldsDeleted: number;
  sourceFile: string;
};

type LogEntryRow = {
  id: number;
  timestamp: string;
  level: string;
  event: string;
  message: string;
  data_json: string;
  source_file: string;
  line_number: number;
};

type FilterSql = {
  args: Array<string | number>;
  joinSql: string;
  whereClauses: string[];
};

export class LogDatabase {
  private readonly db: DatabaseSync;

  constructor(readonly dbPath: string) {
    mkdirSync(dirname(dbPath), { recursive: true });
    this.db = new DatabaseSync(dbPath);
    this.db.exec("PRAGMA journal_mode = WAL;");
    this.db.exec("PRAGMA synchronous = NORMAL;");
    this.db.exec("PRAGMA temp_store = MEMORY;");
    this.initialize();
  }

  close(): void {
    this.db.close();
  }

  getStats(): DatabaseStats {
    const entryRow = this.db.prepare("SELECT COUNT(*) AS count FROM log_entries").get() as {
      count: number;
    };
    const fieldRow = this.db.prepare("SELECT COUNT(*) AS count FROM log_fields").get() as {
      count: number;
    };
    const pageCountRow = this.db.prepare("PRAGMA page_count").get() as { page_count: number };
    const pageSizeRow = this.db.prepare("PRAGMA page_size").get() as { page_size: number };

    const pageCount = Number(pageCountRow.page_count || 0);
    const pageSize = Number(pageSizeRow.page_size || 0);

    return {
      entryCount: Number(entryRow.count || 0),
      fieldCount: Number(fieldRow.count || 0),
      pageCount,
      pageSize,
      approximateSizeBytes: pageCount * pageSize,
    };
  }

  pruneOlderThan(cutoffIso: string): PruneResult {
    return this.pruneByRetention({
      normalCutoffIso: cutoffIso,
      auditCutoffIso: cutoffIso,
    });
  }

  pruneByRetention(input: { normalCutoffIso: string; auditCutoffIso: string }): PruneResult {
    this.db.exec("BEGIN IMMEDIATE TRANSACTION");
    try {
      const deletedFieldsResult = this.db
        .prepare(
          `
          DELETE FROM log_fields
          WHERE entry_id IN (
            SELECT id
            FROM log_entries
            WHERE (is_audit = 0 AND timestamp < ?)
               OR (is_audit = 1 AND timestamp < ?)
          )
        `,
        )
        .run(input.normalCutoffIso, input.auditCutoffIso);

      const deletedNormalEntriesResult = this.db
        .prepare("DELETE FROM log_entries WHERE is_audit = 0 AND timestamp < ?")
        .run(input.normalCutoffIso);
      const deletedAuditEntriesResult = this.db
        .prepare("DELETE FROM log_entries WHERE is_audit = 1 AND timestamp < ?")
        .run(input.auditCutoffIso);

      this.db.exec("COMMIT");

      const normalEntriesDeleted = Number(deletedNormalEntriesResult.changes || 0);
      const auditEntriesDeleted = Number(deletedAuditEntriesResult.changes || 0);

      return {
        normalCutoffIso: input.normalCutoffIso,
        auditCutoffIso: input.auditCutoffIso,
        normalEntriesDeleted,
        auditEntriesDeleted,
        entriesDeleted: normalEntriesDeleted + auditEntriesDeleted,
        fieldsDeleted: Number(deletedFieldsResult.changes || 0),
      };
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }

  vacuum(): void {
    this.db.exec("VACUUM");
    this.db.exec("PRAGMA wal_checkpoint(TRUNCATE)");
  }

  upsertEntry(input: UpsertEntryInput): UpsertEntryResult {
    const statement = this.db.prepare(`
      INSERT OR IGNORE INTO log_entries
      (timestamp, level, event, message, is_audit, data_json, source_file, line_number)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const result = statement.run(
      input.timestamp,
      input.level,
      input.event,
      input.message,
      input.isAudit ? 1 : 0,
      input.dataJson,
      input.sourceFile,
      input.lineNumber,
    );

    if (result.changes > 0) {
      return {
        entryId: Number(result.lastInsertRowid),
        inserted: true,
      };
    }

    const existing = this.db
      .prepare("SELECT id FROM log_entries WHERE source_file = ? AND line_number = ?")
      .get(input.sourceFile, input.lineNumber) as { id: number } | undefined;

    if (!existing) {
      throw new Error("Could not read existing log entry after insert ignore.");
    }

    return {
      entryId: existing.id,
      inserted: false,
    };
  }

  upsertField(entryId: number, key: string, value: string): void {
    this.db
      .prepare("INSERT OR IGNORE INTO log_fields(entry_id, key, value_text) VALUES (?, ?, ?)")
      .run(entryId, key, value);
  }

  reset(): ResetResult {
    this.db.exec("BEGIN IMMEDIATE TRANSACTION");
    try {
      const deletedFieldsResult = this.db.prepare("DELETE FROM log_fields").run();
      const deletedEntriesResult = this.db.prepare("DELETE FROM log_entries").run();
      this.db.exec("COMMIT");
      return {
        entriesDeleted: Number(deletedEntriesResult.changes || 0),
        fieldsDeleted: Number(deletedFieldsResult.changes || 0),
      };
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }

  deleteEntriesForSourceFile(sourceFile: string): DeleteBySourceFileResult {
    this.db.exec("BEGIN IMMEDIATE TRANSACTION");
    try {
      const deletedFieldsResult = this.db
        .prepare(
          `
          DELETE FROM log_fields
          WHERE entry_id IN (
            SELECT id FROM log_entries WHERE source_file = ?
          )
        `,
        )
        .run(sourceFile);

      const deletedEntriesResult = this.db
        .prepare("DELETE FROM log_entries WHERE source_file = ?")
        .run(sourceFile);

      this.db.exec("COMMIT");

      return {
        sourceFile,
        entriesDeleted: Number(deletedEntriesResult.changes || 0),
        fieldsDeleted: Number(deletedFieldsResult.changes || 0),
      };
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }

  queryPage(
    options: LogQueryOptions,
    cursor?: LogCursor,
  ): {
    entries: IndexedLogEntry[];
    hasMore: boolean;
    limit: number;
  } {
    const filter = this.buildFilterSql(options, "f");
    const args: Array<string | number> = [...filter.args];
    const whereClauses = [...filter.whereClauses];
    const limit = this.resolveLimit(options.limit, 1000);

    if (cursor) {
      whereClauses.push("(e.timestamp < ? OR (e.timestamp = ? AND e.id < ?))");
      args.push(cursor.timestamp, cursor.timestamp, cursor.id);
    }

    const whereSql = whereClauses.length > 0 ? `WHERE ${whereClauses.join(" AND ")}` : "";

    const sql = `
      SELECT DISTINCT
        e.id,
        e.timestamp,
        e.level,
        e.event,
        e.message,
        e.data_json,
        e.source_file,
        e.line_number
      FROM log_entries e
      ${filter.joinSql}
      ${whereSql}
      ORDER BY e.timestamp DESC, e.id DESC
      LIMIT ?
    `;

    args.push(limit + 1);

    const rows = this.db.prepare(sql).all(...args) as LogEntryRow[];
    const hasMore = rows.length > limit;
    const pageRows = hasMore ? rows.slice(0, limit) : rows;

    return {
      entries: this.mapRows(pageRows),
      hasMore,
      limit,
    };
  }

  count(options: Omit<LogQueryOptions, "cursor" | "limit">): number {
    const filter = this.buildFilterSql(options, "f");
    const whereSql =
      filter.whereClauses.length > 0 ? `WHERE ${filter.whereClauses.join(" AND ")}` : "";
    const sql = `
      SELECT COUNT(DISTINCT e.id) AS count
      FROM log_entries e
      ${filter.joinSql}
      ${whereSql}
    `;

    const row = this.db.prepare(sql).get(...filter.args) as { count: number } | undefined;
    return Number(row?.count || 0);
  }

  aggregate(
    options: Omit<LogQueryOptions, "cursor">,
    groupBy: LogAggregateGroupBy,
    groupField?: string,
  ): LogAggregateBucket[] {
    const filter = this.buildFilterSql(options, "ff");
    const limit = this.resolveLimit(options.limit, 1000);

    let selectSql = "";
    let groupSql = "";
    let groupJoinSql = "";
    const args: Array<string | number> = [];

    if (groupBy === "level") {
      selectSql = "e.level AS key, COUNT(DISTINCT e.id) AS count";
      groupSql = "GROUP BY e.level";
    } else if (groupBy === "event") {
      selectSql = "e.event AS key, COUNT(DISTINCT e.id) AS count";
      groupSql = "GROUP BY e.event";
    } else if (groupBy === "correlation") {
      selectSql =
        "COALESCE(corr.value_text, req.value_text, '(missing)') AS key, COUNT(DISTINCT e.id) AS count";
      groupSql = "GROUP BY COALESCE(corr.value_text, req.value_text, '(missing)')";
      groupJoinSql = `
        LEFT JOIN log_fields corr ON corr.entry_id = e.id AND corr.key = 'correlationId'
        LEFT JOIN log_fields req ON req.entry_id = e.id AND req.key = 'requestId'
      `;
    } else {
      const normalizedGroupField = (groupField || "").trim();
      if (!normalizedGroupField) {
        throw new Error("groupField is required when groupBy=field");
      }
      selectSql = "COALESCE(gf.value_text, '(missing)') AS key, COUNT(DISTINCT e.id) AS count";
      groupSql = "GROUP BY COALESCE(gf.value_text, '(missing)')";
      groupJoinSql = "LEFT JOIN log_fields gf ON gf.entry_id = e.id AND gf.key = ?";
      args.push(normalizedGroupField);
    }

    const whereSql =
      filter.whereClauses.length > 0 ? `WHERE ${filter.whereClauses.join(" AND ")}` : "";
    const sql = `
      SELECT
        ${selectSql}
      FROM log_entries e
      ${groupJoinSql}
      ${filter.joinSql}
      ${whereSql}
      ${groupSql}
      ORDER BY count DESC, key ASC
      LIMIT ?
    `;

    args.push(...filter.args, limit);

    const rows = this.db.prepare(sql).all(...args) as Array<{ count: number; key: string | null }>;
    return rows.map((row) => ({
      key: row.key ?? "(missing)",
      count: Number(row.count || 0),
    }));
  }

  private initialize(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS log_entries (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        timestamp TEXT NOT NULL,
        level TEXT NOT NULL,
        event TEXT NOT NULL,
        message TEXT NOT NULL,
        is_audit INTEGER NOT NULL DEFAULT 0,
        data_json TEXT NOT NULL,
        source_file TEXT NOT NULL,
        line_number INTEGER NOT NULL,
        indexed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(source_file, line_number)
      );

      CREATE TABLE IF NOT EXISTS log_fields (
        entry_id INTEGER NOT NULL,
        key TEXT NOT NULL,
        value_text TEXT NOT NULL,
        UNIQUE(entry_id, key, value_text),
        FOREIGN KEY(entry_id) REFERENCES log_entries(id) ON DELETE CASCADE
      );
    `);

    this.ensureAuditColumn();

    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_log_entries_timestamp ON log_entries(timestamp);
      CREATE INDEX IF NOT EXISTS idx_log_entries_level_timestamp ON log_entries(level, timestamp);
      CREATE INDEX IF NOT EXISTS idx_log_entries_event_timestamp ON log_entries(event, timestamp);
      CREATE INDEX IF NOT EXISTS idx_log_entries_audit_timestamp ON log_entries(is_audit, timestamp);
      CREATE INDEX IF NOT EXISTS idx_log_fields_key_value ON log_fields(key, value_text);
      CREATE INDEX IF NOT EXISTS idx_log_fields_entry_key ON log_fields(entry_id, key);
    `);
  }

  private ensureAuditColumn(): void {
    const columns = this.db.prepare("PRAGMA table_info(log_entries)").all() as Array<{
      name: string;
    }>;
    const hasAuditColumn = columns.some((column) => column.name === "is_audit");
    if (hasAuditColumn) return;
    this.db.exec("ALTER TABLE log_entries ADD COLUMN is_audit INTEGER NOT NULL DEFAULT 0");
  }

  private buildFilterSql(options: Omit<LogQueryOptions, "cursor">, fieldAlias: string): FilterSql {
    const whereClauses: string[] = [];
    const args: Array<string | number> = [];

    if (options.from) {
      whereClauses.push("e.timestamp >= ?");
      args.push(options.from);
    }

    if (options.to) {
      whereClauses.push("e.timestamp <= ?");
      args.push(options.to);
    }

    if (options.level) {
      whereClauses.push("e.level = ?");
      args.push(options.level.toUpperCase());
    }

    if (options.audit !== undefined) {
      whereClauses.push("e.is_audit = ?");
      args.push(options.audit ? 1 : 0);
    }

    let joinSql = "";
    if (options.field && options.value !== undefined) {
      joinSql = `JOIN log_fields ${fieldAlias} ON ${fieldAlias}.entry_id = e.id`;
      whereClauses.push(`${fieldAlias}.key = ?`);
      whereClauses.push(`${fieldAlias}.value_text = ?`);
      args.push(options.field, options.value);
    }

    return {
      args,
      joinSql,
      whereClauses,
    };
  }

  private mapRows(rows: LogEntryRow[]): IndexedLogEntry[] {
    return rows.map((row) => ({
      id: row.id,
      timestamp: row.timestamp,
      level: row.level,
      event: row.event,
      message: row.message,
      data: JSON.parse(row.data_json) as IndexedLogEntry["data"],
      sourceFile: row.source_file,
      lineNumber: row.line_number,
    }));
  }

  private resolveLimit(input: number | undefined, max: number): number {
    return Math.max(1, Math.min(max, Math.trunc(input || 100)));
  }
}
