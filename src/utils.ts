import chalk from "chalk";
import type { MdbaseError } from "@callumalpass/mdbase";

type ClosableCollection = {
  close(): Promise<void>;
};

export function formatIssue(issue: MdbaseError): string {
  const severity = issue.severity ?? "error";
  const tag =
    severity === "error"
      ? chalk.red("error")
      : severity === "warning"
        ? chalk.yellow("warn")
        : chalk.blue("info");

  const field = issue.field ? ` field ${chalk.bold(issue.field)}` : "";
  return `  ${tag}${field}: ${issue.message} ${chalk.dim(`[${issue.code}]`)}`;
}

export async function finishCommand(
  collection: ClosableCollection | null | undefined,
  code: number,
): Promise<void> {
  process.exitCode = code;

  if (!collection) return;

  try {
    await collection.close();
  } catch {
    // Best-effort cleanup: preserve the command's intended exit status.
  }
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
