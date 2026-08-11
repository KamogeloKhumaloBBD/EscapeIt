import pino, { type Logger } from "pino";

const sensitiveLogPaths = [
  'req.headers["authorization"]',
  'req.headers["cookie"]',
  'req.headers["set-cookie"]',
  'req.headers["x-api-key"]',
  'res.headers["set-cookie"]',
];

export function createLogger(level = "info"): Logger {
  return pino({
    level,
    redact: {
      censor: "[REDACTED]",
      paths: sensitiveLogPaths,
    },
  });
}
