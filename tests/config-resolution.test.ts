import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import {
  DEFAULT_MIKROSCOPE_CONFIG_FILE_PATH,
  resolveMikroScopeServerOptions,
  resolveServerConfigFilePath,
} from "../src/application/config/resolveMikroScopeServerOptions.js";

const cleanupPaths: string[] = [];

afterEach(async () => {
  while (cleanupPaths.length > 0) {
    const path = cleanupPaths.pop();
    if (!path) continue;
    await rm(path, { recursive: true, force: true });
  }
});

describe("MikroScope configuration resolution", () => {
  it("resolves defaults, file values, env values, and direct overrides in precedence order", async () => {
    const tempRoot = await mkdtemp(join(tmpdir(), "mikroscope-config-resolve-"));
    cleanupPaths.push(tempRoot);

    const configFilePath = join(tempRoot, "mikroscope.config.json");
    await writeFile(
      configFilePath,
      JSON.stringify(
        {
          host: "from-file",
          ingestQueueFlushMs: 99,
          port: 4500,
          protocol: "http",
        },
        null,
        2,
      ),
      "utf8",
    );

    const env = {
      MIKROSCOPE_HOST: "from-env",
      MIKROSCOPE_INGEST_QUEUE_FLUSH_MS: "77",
      MIKROSCOPE_PORT: "4600",
      MIKROSCOPE_PROTOCOL: "https",
    } as NodeJS.ProcessEnv;

    const resolved = resolveMikroScopeServerOptions({
      configFilePath,
      env,
      overrides: {
        host: "from-direct",
        port: 4700,
      },
    });

    expect(resolved.host).toBe("from-direct");
    expect(resolved.port).toBe(4700);
    expect(resolved.protocol).toBe("https");
    expect(resolved.ingestQueueFlushMs).toBe(77);
  });

  it("falls back to safe defaults for invalid critical values", async () => {
    const tempRoot = await mkdtemp(join(tmpdir(), "mikroscope-config-invalid-"));
    cleanupPaths.push(tempRoot);

    const configFilePath = join(tempRoot, "mikroscope.config.json");
    await writeFile(
      configFilePath,
      JSON.stringify(
        {
          attachSignalHandlers: "false",
          dbPath: "",
          logsPath: "",
          port: "invalid",
        },
        null,
        2,
      ),
      "utf8",
    );

    const resolved = resolveMikroScopeServerOptions({
      configFilePath,
      env: {} as NodeJS.ProcessEnv,
    });

    expect(resolved.dbPath).toBe("./data/mikroscope.db");
    expect(resolved.logsPath).toBe("./logs");
    expect(resolved.port).toBe(4310);
    expect(resolved.attachSignalHandlers).toBe(false);
  });

  it("resolves config file path from CLI args, env, and default fallback", () => {
    const fromArgs = resolveServerConfigFilePath(
      ["serve", "--config", "/tmp/custom-config.json"],
      {} as NodeJS.ProcessEnv,
    );
    expect(fromArgs).toBe("/tmp/custom-config.json");

    const fromEnv = resolveServerConfigFilePath(["serve"], {
      MIKROSCOPE_CONFIG_PATH: "/tmp/env-config.json",
    } as NodeJS.ProcessEnv);
    expect(fromEnv).toBe("/tmp/env-config.json");

    const fromDefault = resolveServerConfigFilePath(["serve"], {} as NodeJS.ProcessEnv);
    expect(fromDefault).toBe(DEFAULT_MIKROSCOPE_CONFIG_FILE_PATH);
  });
});
