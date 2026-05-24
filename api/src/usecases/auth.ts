import type { IncomingMessage } from "node:http";

type BasicAuthPolicyOptions = {
  authPassword?: string;
  authUsername?: string;
};

export type BasicAuthPolicy = {
  enabled: boolean;
  password?: string;
  username?: string;
};

export function createBasicAuthPolicy(options: BasicAuthPolicyOptions): BasicAuthPolicy {
  const username = (options.authUsername ?? process.env.MIKROSCOPE_AUTH_USERNAME ?? "").trim();
  const password = options.authPassword ?? process.env.MIKROSCOPE_AUTH_PASSWORD;

  if ((username && !password) || (!username && password)) {
    throw new Error("Basic auth requires both authUsername and authPassword.");
  }

  if (!username || !password) {
    return {
      enabled: false,
    };
  }

  return {
    enabled: true,
    password,
    username,
  };
}

export function getAuthorizationToken(req: IncomingMessage): string | undefined {
  const header = req.headers.authorization;
  if (!header) return undefined;

  const [scheme, token] = header.split(" ");
  if (scheme?.toLowerCase() !== "bearer" || !token) return undefined;
  return token;
}

function getBasicAuthCredentials(
  req: IncomingMessage,
): { password: string; username: string } | undefined {
  const header = req.headers.authorization;
  if (!header) return undefined;

  const [scheme, encoded] = header.split(" ");
  if (scheme?.toLowerCase() !== "basic" || !encoded) return undefined;

  let decoded = "";
  try {
    decoded = Buffer.from(encoded, "base64").toString("utf8");
  } catch {
    return undefined;
  }

  const separator = decoded.indexOf(":");
  if (separator <= 0) return undefined;

  return {
    username: decoded.slice(0, separator),
    password: decoded.slice(separator + 1),
  };
}

export function getAuthenticatedBasicUsername(
  req: IncomingMessage,
  policy: BasicAuthPolicy,
): string | undefined {
  if (!policy.enabled || !policy.username || policy.password === undefined) return undefined;

  const credentials = getBasicAuthCredentials(req);
  if (!credentials) return undefined;
  if (credentials.username !== policy.username) return undefined;
  if (credentials.password !== policy.password) return undefined;

  return credentials.username;
}

export function isApiAuthorized(
  req: IncomingMessage,
  apiToken: string | undefined,
  basicAuth: BasicAuthPolicy,
): boolean {
  const hasBearerAuth = typeof apiToken === "string" && apiToken.length > 0;
  const hasBasicAuth = basicAuth.enabled;
  if (!hasBearerAuth && !hasBasicAuth) return true;

  if (hasBearerAuth && getAuthorizationToken(req) === apiToken) return true;
  return getAuthenticatedBasicUsername(req, basicAuth) !== undefined;
}

export function resolveIngestProducerId(
  req: IncomingMessage,
  basicAuth: BasicAuthPolicy,
  producerByToken: Map<string, string>,
): string | undefined {
  const basicUsername = getAuthenticatedBasicUsername(req, basicAuth);
  if (basicUsername) return basicUsername;

  const token = getAuthorizationToken(req);
  if (!token) return undefined;
  return producerByToken.get(token);
}
