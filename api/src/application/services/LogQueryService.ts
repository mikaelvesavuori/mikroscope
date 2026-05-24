import type { LogDatabase } from "../../infrastructure/persistence/LogDatabase.js";
import type {
  LogAggregateBucket,
  LogAggregateGroupBy,
  LogCursor,
  LogQueryOptions,
  LogQueryPage,
} from "../../interfaces/index.js";

function normalizeLimit(input: number | undefined, fallback: number, max: number): number {
  return Math.max(1, Math.min(max, Math.trunc(input || fallback)));
}

const MAX_QUERY_LIMIT = 1_000;

function encodeCursor(cursor: LogCursor): string {
  return Buffer.from(JSON.stringify(cursor), "utf8").toString("base64url");
}

function decodeCursor(cursor: string | undefined): LogCursor | undefined {
  if (!cursor) return undefined;
  try {
    const parsed = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8")) as {
      id?: unknown;
      timestamp?: unknown;
    };
    if (typeof parsed.timestamp !== "string") return undefined;
    if (typeof parsed.id !== "number" || !Number.isFinite(parsed.id) || parsed.id <= 0)
      return undefined;
    return {
      id: Math.trunc(parsed.id),
      timestamp: parsed.timestamp,
    };
  } catch {
    return undefined;
  }
}

export class LogQueryService {
  constructor(private readonly db: LogDatabase) {}

  queryLogsPage(options: LogQueryOptions): LogQueryPage {
    const cursor = decodeCursor(options.cursor);
    const limit = normalizeLimit(options.limit, 100, MAX_QUERY_LIMIT);
    const page = this.db.queryPage({ ...options, limit }, cursor);
    const lastEntry = page.entries[page.entries.length - 1];

    return {
      entries: page.entries,
      hasMore: page.hasMore,
      limit: page.limit,
      nextCursor:
        page.hasMore && lastEntry
          ? encodeCursor({ id: lastEntry.id, timestamp: lastEntry.timestamp })
          : undefined,
    };
  }

  aggregateLogs(
    options: Omit<LogQueryOptions, "cursor">,
    groupBy: LogAggregateGroupBy,
    groupField?: string,
  ): LogAggregateBucket[] {
    const limit = normalizeLimit(options.limit, 25, MAX_QUERY_LIMIT);
    return this.db.aggregate({ ...options, limit }, groupBy, groupField);
  }

  countLogs(options: Omit<LogQueryOptions, "cursor" | "limit">): number {
    return this.db.count(options);
  }
}
