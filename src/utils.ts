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
  process.exit(code);
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
