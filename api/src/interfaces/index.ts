export type LogLevel = "DEBUG" | "INFO" | "WARN" | "ERROR" | string;

export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };
export type LogRecord = Record<string, JsonValue | undefined>;

export type IndexedLogEntry = {
  id: number;
  timestamp: string;
  level: string;
  event: string;
  message: string;
  data: LogRecord;
  sourceFile: string;
  lineNumber: number;
};

export type LogQueryOptions = {
  from?: string;
  to?: string;
  level?: string;
  audit?: boolean;
  field?: string;
  limit?: number;
  value?: string;
  cursor?: string;
};

export type LogCursor = {
  id: number;
  timestamp: string;
};

export type LogQueryPage = {
  entries: IndexedLogEntry[];
  hasMore: boolean;
  limit: number;
  nextCursor?: string;
};

export type LogAggregateGroupBy = "level" | "event" | "field" | "correlation";

export type LogAggregateBucket = {
  key: string;
  count: number;
};

export type IndexReport = {
  filesScanned: number;
  linesScanned: number;
  recordsInserted: number;
  recordsSkipped: number;
  parseErrors: number;
  startedAt: string;
  finishedAt: string;
  mode?: "full" | "incremental";
};
