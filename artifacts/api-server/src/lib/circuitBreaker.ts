import { createLogger } from "./logger";

const log = createLogger("circuit-breaker");

type CircuitState = "closed" | "open" | "half-open";

interface CircuitBreakerOptions {
  failureThreshold?: number;
  successThreshold?: number;
  openDurationMs?: number;
}

interface CircuitStats {
  state: CircuitState;
  failures: number;
  successes: number;
  lastFailureAt: number | null;
  lastErrorMessage: string | null;
}

const circuits = new Map<string, CircuitStats>();

function getOrCreate(name: string): CircuitStats {
  if (!circuits.has(name)) {
    circuits.set(name, { state: "closed", failures: 0, successes: 0, lastFailureAt: null, lastErrorMessage: null });
  }
  return circuits.get(name)!;
}

export function getCircuitStatus(name: string): CircuitStats & { name: string } {
  return { name, ...getOrCreate(name) };
}

export function getAllCircuitStatuses(): Array<CircuitStats & { name: string }> {
  return Array.from(circuits.entries()).map(([name, stats]) => ({ name, ...stats }));
}

export async function withCircuitBreaker<T>(
  name: string,
  fn: () => Promise<T>,
  options: CircuitBreakerOptions = {}
): Promise<T> {
  const { failureThreshold = 3, successThreshold = 2, openDurationMs = 60_000 } = options;
  const circuit = getOrCreate(name);

  if (circuit.state === "open") {
    const elapsed = Date.now() - (circuit.lastFailureAt ?? 0);
    if (elapsed < openDurationMs) {
      throw new Error(`[${name}] Circuit is OPEN — skipping call. Last error: ${circuit.lastErrorMessage ?? "unknown"}`);
    }
    circuit.state = "half-open";
    log.info(`Circuit ${name} transitioning to HALF-OPEN`);
  }

  try {
    const result = await fn();
    if (circuit.state === "half-open") {
      circuit.successes++;
      if (circuit.successes >= successThreshold) {
        circuit.state = "closed";
        circuit.failures = 0;
        circuit.successes = 0;
        log.info(`Circuit ${name} CLOSED after recovery`);
      }
    } else {
      circuit.failures = 0;
    }
    return result;
  } catch (err) {
    circuit.failures++;
    circuit.lastFailureAt = Date.now();
    circuit.lastErrorMessage = err instanceof Error ? err.message : String(err);
    if (circuit.failures >= failureThreshold || circuit.state === "half-open") {
      circuit.state = "open";
      log.warn(`Circuit ${name} OPENED after ${circuit.failures} failures`, { error: circuit.lastErrorMessage });
    }
    throw err;
  }
}

export async function fetchWithRetry<T>(
  name: string,
  fn: () => Promise<T>,
  retries = 3,
  delayMs = 1000
): Promise<T> {
  let lastErr: unknown;
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (attempt < retries) {
        log.warn(`[${name}] attempt ${attempt}/${retries} failed — retrying in ${delayMs}ms`, { error: err instanceof Error ? err.message : String(err) });
        await new Promise((r) => setTimeout(r, delayMs * attempt));
      }
    }
  }
  throw lastErr;
}
