/**
 * Gracefully close a Collection and exit the process.
 *
 * On Windows, calling process.exit() while a Collection still holds open
 * handles (sql.js WASM database, prepared statements) triggers a libuv
 * assertion failure:
 *
 *   Assertion failed: !(handle->flags & UV_HANDLE_CLOSING),
 *   file src\win\async.c, line 76
 *
 * Always close the collection before exiting to release all internal
 * resources (flush the SQLite cache, free prepared statements, close the
 * database) so the event loop can shut down cleanly.
 *
 * After closing, we schedule process.exit() on a short timer so that
 * any pending libuv close-callbacks (e.g. the uv_async_t torn down by
 * the WASM runtime) can fire before the process terminates.  The function
 * itself never resolves, so callers see it as Promise<never> and do not
 * execute any code after it.
 */
export async function closeAndExit(
  collection: { close(): Promise<void> } | null | undefined,
  code: number,
): Promise<never> {
  if (collection) {
    try {
      await collection.close();
    } catch {
      // Ignore cleanup errors — we're exiting anyway.
    }
  }
  process.exitCode = code;
  // Schedule process.exit() after a short delay so libuv close-callbacks
  // can finish before the handle list is torn down.
  setTimeout(() => process.exit(code), 50);
  // Never resolve — the timer above will terminate the process.
  return new Promise<never>(() => { });
}

export function splitList(value: string | undefined): string[] | undefined {
  if (value === undefined) return undefined;
  const parts = value.split(",").map((s) => s.trim()).filter((s) => s.length > 0);
  if (parts.length === 0) return undefined;
  return parts;
}

export function parseFieldValue(raw: string): unknown {
  if (raw === "true") return true;
  if (raw === "false") return false;
  if (raw === "null") return null;
  if (/^-?\d+$/.test(raw)) return parseInt(raw, 10);
  if (/^-?\d+\.\d+$/.test(raw)) return parseFloat(raw);

  // Array: try JSON first, fall back to comma-split for bare values like [a, b, c]
  if (raw.startsWith("[") && raw.endsWith("]")) {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed;
    } catch {
      return raw.slice(1, -1).split(",").map((s) => s.trim()).filter((s) => s.length > 0);
    }
  }

  return raw;
}
