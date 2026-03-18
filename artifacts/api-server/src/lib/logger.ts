type LogLevel = "debug" | "info" | "warn" | "error";

const LEVELS: Record<LogLevel, number> = { debug: 0, info: 1, warn: 2, error: 3 };
const MIN_LEVEL: LogLevel = (process.env["LOG_LEVEL"] as LogLevel | undefined) ?? "info";

function shouldLog(level: LogLevel): boolean {
  return LEVELS[level] >= LEVELS[MIN_LEVEL];
}

function timestamp(): string {
  return new Date().toISOString();
}

function format(level: LogLevel, tag: string, message: string, meta?: unknown): string {
  const metaStr = meta !== undefined ? " " + JSON.stringify(meta) : "";
  return `[${timestamp()}] [${level.toUpperCase().padEnd(5)}] [${tag}] ${message}${metaStr}`;
}

export function createLogger(tag: string) {
  return {
    debug: (msg: string, meta?: unknown) => {
      if (shouldLog("debug")) console.debug(format("debug", tag, msg, meta));
    },
    info: (msg: string, meta?: unknown) => {
      if (shouldLog("info")) console.info(format("info", tag, msg, meta));
    },
    warn: (msg: string, meta?: unknown) => {
      if (shouldLog("warn")) console.warn(format("warn", tag, msg, meta));
    },
    error: (msg: string, meta?: unknown) => {
      if (shouldLog("error")) console.error(format("error", tag, msg, meta));
    },
  };
}

export const rootLogger = createLogger("app");
