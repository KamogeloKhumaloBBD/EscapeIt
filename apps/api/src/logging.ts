import pino, { type Logger } from "pino";

const sensitiveLogPaths = [
  'req.headers["authorization"]',
  'req.headers["cookie"]',
  'req.headers["set-cookie"]',
  'req.headers["x-api-key"]',
  'res.headers["set-cookie"]',
];

export function requestPath(value: unknown): string {
  if (typeof value !== "string") return "";
  return value.split("?", 1)[0] ?? "";
}

function stringOrUndefined(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function numberOrUndefined(value: unknown): number | undefined {
  return typeof value === "number" ? value : undefined;
}

export function serializeRequest(request: unknown) {
  if (typeof request !== "object" || request === null) return {};

  return {
    id: stringOrUndefined(Reflect.get(request, "id")),
    method: stringOrUndefined(Reflect.get(request, "method")),
    remoteAddress: stringOrUndefined(Reflect.get(request, "remoteAddress")),
    remotePort: numberOrUndefined(Reflect.get(request, "remotePort")),
    url: requestPath(Reflect.get(request, "url")),
  };
}

export function createLogger(level = "info"): Logger {
  return pino({
    level,
    redact: {
      censor: "[REDACTED]",
      paths: sensitiveLogPaths,
    },
  });
}
