import type { IncomingMessage, ServerResponse } from "node:http";

export function parseAllowedOrigins(value: string | undefined): string[] {
  if (!value || value.trim().length === 0) return ["*"];
  const origins = value
    .split(",")
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0);
  return origins.length > 0 ? origins : ["*"];
}

export function setCorsHeaders(
  req: IncomingMessage,
  res: ServerResponse,
  corsAllowOrigins: string[],
): void {
  const requestOrigin = req.headers.origin;
  const hasWildcard = corsAllowOrigins.includes("*");
  const matchedOrigin =
    typeof requestOrigin === "string"
      ? corsAllowOrigins.find((origin) => origin === requestOrigin)
      : undefined;
  const allowOrigin = hasWildcard ? "*" : matchedOrigin;

  if (allowOrigin) {
    res.setHeader("access-control-allow-origin", allowOrigin);
  }
  if (!hasWildcard && allowOrigin) {
    res.setHeader("vary", "Origin");
  }

  res.setHeader("access-control-allow-methods", "GET,POST,PUT,OPTIONS");
  res.setHeader("access-control-allow-headers", "authorization,content-type");
  res.setHeader("access-control-max-age", "600");
}

export function json(
  req: IncomingMessage,
  res: ServerResponse,
  code: number,
  body: unknown,
  corsAllowOrigins: string[],
): void {
  setCorsHeaders(req, res, corsAllowOrigins);
  const serialized = JSON.stringify(body);
  res.statusCode = code;
  res.setHeader("content-type", "application/json; charset=utf-8");
  res.end(serialized);
}

export async function readJsonBody(req: IncomingMessage, maxBodyBytes: number): Promise<unknown> {
  return await new Promise<unknown>((resolve, reject) => {
    const chunks: Buffer[] = [];
    let total = 0;
    let aborted = false;

    req.on("data", (chunk) => {
      if (aborted) return;

      const buffer = Buffer.from(chunk);
      total += buffer.length;
      if (total > maxBodyBytes) {
        aborted = true;
        reject(new Error(`Payload too large. Max body size is ${maxBodyBytes} bytes.`));
        return;
      }
      chunks.push(buffer);
    });

    req.on("end", () => {
      if (aborted) return;

      const raw = Buffer.concat(chunks).toString("utf8").trim();
      if (!raw) {
        resolve([]);
        return;
      }

      try {
        resolve(JSON.parse(raw) as unknown);
      } catch {
        reject(new Error("Invalid JSON payload."));
      }
    });

    req.on("error", (error) => {
      if (aborted) return;
      reject(error);
    });
  });
}
