import { mkdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";

type MockConfig = {
  auditLogsPerDay: number;
  days: number;
  logsPerDay: number;
  outDir: string;
  seed: number;
  tenants: number;
};

type WeightedEvent = {
  event: string;
  levelWeights: Array<{ level: string; weight: number }>;
  message: string;
  weight: number;
};

const NORMAL_EVENTS: WeightedEvent[] = [
  {
    event: "chat.message.received",
    levelWeights: [{ level: "INFO", weight: 80 }, { level: "DEBUG", weight: 20 }],
    message: "Incoming user message received",
    weight: 18,
  },
  {
    event: "ai.intent.detected",
    levelWeights: [{ level: "INFO", weight: 74 }, { level: "WARN", weight: 20 }, { level: "ERROR", weight: 6 }],
    message: "Intent detection completed",
    weight: 12,
  },
  {
    event: "matcher.product.candidates",
    levelWeights: [{ level: "DEBUG", weight: 60 }, { level: "INFO", weight: 34 }, { level: "WARN", weight: 6 }],
    message: "Product candidate set generated",
    weight: 15,
  },
  {
    event: "order.draft.updated",
    levelWeights: [{ level: "INFO", weight: 88 }, { level: "WARN", weight: 10 }, { level: "ERROR", weight: 2 }],
    message: "Draft order state updated",
    weight: 12,
  },
  {
    event: "order.placed",
    levelWeights: [{ level: "INFO", weight: 95 }, { level: "WARN", weight: 5 }],
    message: "Order submitted to supplier",
    weight: 8,
  },
  {
    event: "supplier.orders.viewed",
    levelWeights: [{ level: "INFO", weight: 80 }, { level: "DEBUG", weight: 20 }],
    message: "Supplier orders page viewed",
    weight: 9,
  },
  {
    event: "db.write.completed",
    levelWeights: [{ level: "DEBUG", weight: 68 }, { level: "INFO", weight: 27 }, { level: "WARN", weight: 5 }],
    message: "Persistence write completed",
    weight: 10,
  },
  {
    event: "db.write.conflict",
    levelWeights: [{ level: "WARN", weight: 67 }, { level: "ERROR", weight: 33 }],
    message: "Version conflict detected during write",
    weight: 3,
  },
  {
    event: "http.request.completed",
    levelWeights: [{ level: "INFO", weight: 90 }, { level: "WARN", weight: 9 }, { level: "ERROR", weight: 1 }],
    message: "HTTP request processed",
    weight: 13,
  },
];

const AUDIT_EVENTS: Array<{ event: string; message: string; weight: number }> = [
  { event: "audit.auth.login", message: "User authenticated", weight: 25 },
  { event: "audit.customer.updated", message: "Customer record modified", weight: 19 },
  { event: "audit.order.approved", message: "Order approved for checkout", weight: 18 },
  { event: "audit.order.cancelled", message: "Order was cancelled", weight: 8 },
  { event: "audit.permissions.changed", message: "Role permissions changed", weight: 10 },
  { event: "audit.token.rotated", message: "Token was rotated", weight: 5 },
  { event: "audit.export.generated", message: "Data export generated", weight: 15 },
];

const COMPONENTS = [
  "api.orders",
  "api.chat",
  "domain.order-service",
  "domain.matcher",
  "infra.persistence",
  "infra.ai",
  "presentation.http",
];

function parseNumber(value: string | undefined, fallback: number): number {
  if (!value) return fallback;
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return parsed;
}

function loadConfig(): MockConfig {
  return {
    auditLogsPerDay: parseNumber(process.env.MOCK_AUDIT_LOGS_PER_DAY, 150),
    days: parseNumber(process.env.MOCK_LOG_DAYS, 21),
    logsPerDay: parseNumber(process.env.MOCK_LOGS_PER_DAY, 1200),
    outDir: resolve(process.env.MOCK_LOG_OUT_DIR || "./logs"),
    seed: parseNumber(process.env.MOCK_LOG_SEED, 2602),
    tenants: parseNumber(process.env.MOCK_LOG_TENANTS, 320),
  };
}

function mulberry32(seed: number): () => number {
  let value = seed >>> 0;
  return () => {
    value += 0x6d2b79f5;
    let t = value;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pickWeighted<T extends { weight: number }>(items: T[], random: () => number): T {
  const total = items.reduce((sum, item) => sum + item.weight, 0);
  const threshold = random() * total;
  let current = 0;
  for (const item of items) {
    current += item.weight;
    if (threshold <= current) return item;
  }
  return items[items.length - 1];
}

function randomInt(min: number, max: number, random: () => number): number {
  return Math.floor(random() * (max - min + 1)) + min;
}

function randomTimestampWithinDay(dayStartMs: number, random: () => number): string {
  const offsetMs = Math.floor(random() * 24 * 60 * 60 * 1000);
  return new Date(dayStartMs + offsetMs).toISOString();
}

function makeId(prefix: string, number: number): string {
  return `${prefix}-${number.toString(36).toUpperCase().padStart(6, "0")}`;
}

async function writeShard(path: string, entries: object[]): Promise<void> {
  const body = `${entries.map((entry) => JSON.stringify(entry)).join("\n")}\n`;
  await writeFile(path, body, "utf8");
}

async function main(): Promise<void> {
  const config = loadConfig();
  const random = mulberry32(config.seed);
  const outDir = config.outDir;
  const normalDir = join(outDir, "generated");
  const auditDir = join(outDir, "audit", "generated");
  await mkdir(normalDir, { recursive: true });
  await mkdir(auditDir, { recursive: true });

  const now = Date.now();
  let normalCount = 0;
  let auditCount = 0;

  for (let dayOffset = 0; dayOffset < config.days; dayOffset++) {
    const dayStart = new Date(now - (config.days - dayOffset) * 24 * 60 * 60 * 1000);
    dayStart.setUTCHours(0, 0, 0, 0);
    const dayStartMs = dayStart.getTime();

    const normalEntries: object[] = [];
    const auditEntries: object[] = [];

    for (let i = 0; i < config.logsPerDay; i++) {
      const selectedEvent = pickWeighted(NORMAL_EVENTS, random);
      const level = pickWeighted(selectedEvent.levelWeights, random).level;
      const tenantNumber = randomInt(1, config.tenants, random);
      const customerNumber = tenantNumber;
      const orderNumber = randomInt(1, 80_000, random);
      const requestBucket = Math.floor(i / randomInt(2, 7, random));
      const correlationId = makeId(`corr${dayOffset}`, requestBucket);

      normalEntries.push({
        timestamp: randomTimestampWithinDay(dayStartMs, random),
        level,
        event: selectedEvent.event,
        message: selectedEvent.message,
        correlationId,
        requestId: makeId("req", requestBucket),
        tenantId: makeId("ten", tenantNumber),
        customerId: makeId("ten", customerNumber),
        supplierId: makeId("sup", randomInt(1, 220, random)),
        orderId: makeId("ord", orderNumber),
        component: COMPONENTS[randomInt(0, COMPONENTS.length - 1, random)],
        durationMs: randomInt(4, 420, random),
        matchedCandidates: randomInt(0, 40, random),
      });
      normalCount++;
    }

    for (let i = 0; i < config.auditLogsPerDay; i++) {
      const selectedEvent = pickWeighted(AUDIT_EVENTS, random);
      const tenantNumber = randomInt(1, config.tenants, random);
      const customerNumber = tenantNumber;

      auditEntries.push({
        timestamp: randomTimestampWithinDay(dayStartMs, random),
        level: "INFO",
        event: selectedEvent.event,
        message: selectedEvent.message,
        correlationId: makeId(`auditcorr${dayOffset}`, Math.floor(i / 2)),
        requestId: makeId("auditreq", i),
        tenantId: makeId("ten", tenantNumber),
        customerId: makeId("ten", customerNumber),
        actorId: makeId("usr", randomInt(1, 900, random)),
        action: selectedEvent.event,
        audit: true,
        component: "security.audit",
      });
      auditCount++;
    }

    const dayLabel = dayStart.toISOString().slice(0, 10);
    await writeShard(join(normalDir, `orderbutler-mock-${dayLabel}.ndjson`), normalEntries);
    await writeShard(join(auditDir, `orderbutler-audit-mock-${dayLabel}.ndjson`), auditEntries);
  }

  process.stdout.write(
    [
      "MikroScope mock data generated",
      `outDir=${outDir}`,
      `days=${config.days}`,
      `normalLogs=${normalCount}`,
      `auditLogs=${auditCount}`,
      `seed=${config.seed}`,
      "",
      "Next:",
      "1) npm run index",
      "2) npm start",
    ].join("\n"),
  );
}

main().catch((error) => {
  process.stderr.write(
    `[mock-logs] fatal: ${error instanceof Error ? error.stack || error.message : String(error)}\n`,
  );
  process.exit(1);
});
