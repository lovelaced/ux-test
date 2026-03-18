export interface Logger {
  info: (msg: string, ...args: unknown[]) => void;
  warn: (msg: string, ...args: unknown[]) => void;
  error: (msg: string, ...args: unknown[]) => void;
  debug: (msg: string, ...args: unknown[]) => void;
}

let verboseEnabled = false;

export function setVerbose(enabled: boolean): void {
  verboseEnabled = enabled;
}

function timestamp(): string {
  return new Date().toISOString().slice(11, 23);
}

export function createLogger(label: string): Logger {
  const prefix = `[${timestamp()}] [${label}]`;

  return {
    info: (msg, ...args) => console.log(`${prefix} ${msg}`, ...args),
    warn: (msg, ...args) => console.warn(`${prefix} WARN: ${msg}`, ...args),
    error: (msg, ...args) => console.error(`${prefix} ERROR: ${msg}`, ...args),
    debug: (msg, ...args) => {
      if (verboseEnabled) console.log(`${prefix} DEBUG: ${msg}`, ...args);
    },
  };
}
