// Shared logging utility with [MODULE] prefix and ISO timestamps.
export function log(module, message, data = null) {
  const timestamp = new Date().toISOString();
  const prefix = `[${module}] ${timestamp}`;
  if (data !== null && data !== undefined) {
    console.log(`${prefix} ${message}`, data);
  } else {
    console.log(`${prefix} ${message}`);
  }
}

export function logError(module, message, error) {
  const timestamp = new Date().toISOString();
  console.error(`[${module}] ${timestamp} ERROR: ${message}`, {
    message: error?.message,
    stack: error?.stack,
  });
}

export function measureStart() {
  return performance.now();
}

export function measureEnd(startMs) {
  return Math.round(performance.now() - startMs);
}
