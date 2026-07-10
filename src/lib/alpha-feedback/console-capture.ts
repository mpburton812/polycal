const MAX_LINES = 5;
const MAX_LINE_LENGTH = 500;

const buffer: string[] = [];
let installed = false;

function stringifyArg(value: unknown): string {
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function pushLine(level: string, args: unknown[]): void {
  const body = args.map(stringifyArg).join(" ").slice(0, MAX_LINE_LENGTH);
  buffer.push(`[${level}] ${body}`);
  while (buffer.length > MAX_LINES) {
    buffer.shift();
  }
}

/**
 * Installs a one-time console interceptor that keeps the last five log lines (PC-120).
 */
export function installConsoleCapture(): void {
  if (installed || typeof window === "undefined") return;
  installed = true;

  const levels = ["log", "info", "warn", "error"] as const;
  for (const level of levels) {
    const original = console[level].bind(console);
    console[level] = (...args: unknown[]) => {
      pushLine(level, args);
      original(...args);
    };
  }
}

/** Returns a copy of the last captured console lines. */
export function getConsoleLogTail(): string[] {
  return [...buffer];
}
