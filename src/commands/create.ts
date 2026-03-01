import { Command } from "commander";
import path from "node:path";
import chalk from "chalk";
import { Collection } from "@callumalpass/mdbase";
import type { MdbaseError } from "@callumalpass/mdbase";
import yaml from "js-yaml";
import { parseFieldValue, closeAndExit } from "../utils.js";

function parseFields(fieldArgs: string[]): Record<string, unknown> {
  const frontmatter: Record<string, unknown> = {};
  for (const f of fieldArgs) {
    const eqIdx = f.indexOf("=");
    if (eqIdx === -1) {
      console.error(chalk.red(`error: invalid field format: ${f} (expected key=value)`));
      process.exit(1);
    }
    const key = f.slice(0, eqIdx);
    const rawValue = f.slice(eqIdx + 1);
    frontmatter[key] = parseFieldValue(rawValue);
  }
  return frontmatter;
}

function formatValue(value: unknown): string {
  if (value === null || value === undefined) return chalk.dim("null");
  if (Array.isArray(value)) return `[${value.map(String).join(", ")}]`;
  return String(value);
}

export function registerCreate(program: Command): void {
  program
    .command("create [path]")
    .description("Create a new file with typed frontmatter")
    .option("-t, --type <type>", "Type for the new file")
    .option("-f, --field <fields...>", "Field values as key=value pairs")
    .option("--body <body>", "Body content")
    .option("--body-stdin", "Read body from stdin")
    .option("--format <format>", "Output format: text, json, yaml", "text")
    .action(async (filePath: string | undefined, opts) => {
      const cwd = process.cwd();

      // Open the collection
      const openResult = await Collection.open(cwd);
      if (openResult.error) {
        if (opts.format === "json") {
          console.log(JSON.stringify({ error: openResult.error }, null, 2));
        } else {
          console.error(chalk.red(`error: ${openResult.error.message}`));
        }
        await closeAndExit(null, 3);
      }
      const collection = openResult.collection!;

      // Parse field values
      const frontmatter = opts.field ? parseFields(opts.field as string[]) : {};

      // Read body from stdin if requested
      let body: string | undefined = opts.body;
      if (opts.bodyStdin) {
        const chunks: Buffer[] = [];
        for await (const chunk of process.stdin) {
          chunks.push(chunk);
        }
        body = Buffer.concat(chunks).toString("utf-8");
      }

      const relativePath = filePath ? path.relative(cwd, path.resolve(cwd, filePath)) : undefined;

      // Build create input
      const input: {
        type?: string;
        types?: string[];
        path?: string;
        frontmatter?: Record<string, unknown>;
        body?: string;
      } = {
        path: relativePath,
        frontmatter,
      };

      if (opts.type) {
        input.type = opts.type;
      }
      if (body !== undefined) {
        input.body = body;
      }

      const result = await collection.create(input);
      await outputResult(result, relativePath, opts, collection);
    });
}

function formatIssue(issue: MdbaseError): string {
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

async function outputResult(
  result: { valid?: boolean; frontmatter?: Record<string, unknown>; body?: string; path?: string; error?: { code: string; message: string }; issues?: MdbaseError[] },
  requestedPath: string | undefined,
  opts: { format: string },
  collection: { close(): Promise<void> },
): Promise<void> {
  if (result.error) {
    const exitCode = result.error.code === "path_conflict" ? 1
      : result.error.code === "unknown_type" ? 1
        : result.error.code === "validation_failed" ? 2
          : result.error.code === "permission_denied" ? 5
            : 1;

    if (opts.format === "json") {
      const output: Record<string, unknown> = { error: result.error };
      if (result.issues) {
        output.issues = result.issues;
      }
      console.log(JSON.stringify(output, null, 2));
    } else {
      console.error(chalk.red(`error: ${result.error.message}`));
      if (result.issues) {
        for (const issue of result.issues) {
          console.error(formatIssue(issue));
        }
      }
    }
    await closeAndExit(collection, exitCode);
    return;
  }

  const outputPath = result.path ?? requestedPath;

  switch (opts.format) {
    case "json": {
      const output: Record<string, unknown> = {
        path: outputPath,
        frontmatter: result.frontmatter ?? {},
      };
      if (result.body != null && result.body !== "") {
        output.body = result.body;
      }
      console.log(JSON.stringify(output, null, 2));
      break;
    }

    case "yaml": {
      const output: Record<string, unknown> = {
        path: outputPath,
        frontmatter: result.frontmatter ?? {},
      };
      if (result.body != null && result.body !== "") {
        output.body = result.body;
      }
      console.log(yaml.dump(output, { lineWidth: -1, noRefs: true }).trimEnd());
      break;
    }

    case "text":
    default: {
      console.log(`${chalk.green("created")} ${chalk.bold(outputPath)}`);

      const fm = result.frontmatter ?? {};
      const keys = Object.keys(fm);
      if (keys.length > 0) {
        const maxLen = Math.max(...keys.map((k) => k.length));
        for (const key of keys) {
          console.log(`  ${chalk.cyan(key.padEnd(maxLen))}  ${formatValue(fm[key])}`);
        }
      }
      break;
    }
  }

  await closeAndExit(collection, 0);
}
