import { Command } from "commander";
import path from "node:path";
import chalk from "chalk";
import { Collection } from "mdbase";

interface FieldDiff {
  field: string;
  status: "added" | "removed" | "changed" | "equal";
  a?: unknown;
  b?: unknown;
}

interface DiffResult {
  a: string;
  b: string;
  fields: FieldDiff[];
  types: { a: string[]; b: string[]; changed: boolean };
  body?: { a: string; b: string; changed: boolean };
  identical: boolean;
}

function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a === null || b === null) return false;
  if (typeof a !== typeof b) return false;
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    return a.every((v, i) => deepEqual(v, b[i]));
  }
  if (typeof a === "object" && typeof b === "object") {
    const keysA = Object.keys(a as Record<string, unknown>);
    const keysB = Object.keys(b as Record<string, unknown>);
    if (keysA.length !== keysB.length) return false;
    return keysA.every((k) =>
      deepEqual((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k]),
    );
  }
  return false;
}

function formatValue(value: unknown): string {
  if (value === null || value === undefined) return "null";
  if (Array.isArray(value)) return `[${value.map(String).join(", ")}]`;
  return String(value);
}

export function registerDiff(program: Command): void {
  program
    .command("diff <a> <b>")
    .description("Compare two files or collections")
    .option("--format <format>", "Output format: text, json", "text")
    .option("--fields-only", "Compare only frontmatter fields, ignore body")
    .action(async (a: string, b: string, opts) => {
      const cwd = process.cwd();

      const openResult = await Collection.open(cwd);
      if (openResult.error) {
        if (opts.format === "json") {
          console.log(JSON.stringify({ error: openResult.error }, null, 2));
        } else {
          console.error(chalk.red(`error: ${openResult.error.message}`));
        }
        process.exit(3);
      }
      const collection = openResult.collection!;

      const pathA = path.relative(cwd, path.resolve(cwd, a));
      const pathB = path.relative(cwd, path.resolve(cwd, b));

      const [readA, readB] = await Promise.all([
        collection.read(pathA),
        collection.read(pathB),
      ]);

      if (readA.error) {
        if (opts.format === "json") {
          console.log(JSON.stringify({ error: { ...readA.error, path: pathA } }, null, 2));
        } else {
          console.error(chalk.red(`error: ${pathA}: ${readA.error.message}`));
        }
        process.exit(4);
      }
      if (readB.error) {
        if (opts.format === "json") {
          console.log(JSON.stringify({ error: { ...readB.error, path: pathB } }, null, 2));
        } else {
          console.error(chalk.red(`error: ${pathB}: ${readB.error.message}`));
        }
        process.exit(4);
      }

      const fmA = readA.frontmatter ?? {};
      const fmB = readB.frontmatter ?? {};
      const typesA = readA.types ?? [];
      const typesB = readB.types ?? [];

      // Compute field-level diff
      const allKeys = new Set([...Object.keys(fmA), ...Object.keys(fmB)]);
      const fields: FieldDiff[] = [];

      for (const key of allKeys) {
        const inA = key in fmA;
        const inB = key in fmB;

        if (inA && !inB) {
          fields.push({ field: key, status: "removed", a: fmA[key] });
        } else if (!inA && inB) {
          fields.push({ field: key, status: "added", b: fmB[key] });
        } else if (deepEqual(fmA[key], fmB[key])) {
          fields.push({ field: key, status: "equal", a: fmA[key], b: fmB[key] });
        } else {
          fields.push({ field: key, status: "changed", a: fmA[key], b: fmB[key] });
        }
      }

      const typesChanged = !deepEqual(typesA, typesB);

      const result: DiffResult = {
        a: pathA,
        b: pathB,
        fields,
        types: { a: typesA, b: typesB, changed: typesChanged },
        identical: !typesChanged && fields.every((f) => f.status === "equal"),
      };

      if (!opts.fieldsOnly) {
        const bodyA = readA.body ?? "";
        const bodyB = readB.body ?? "";
        const bodyChanged = bodyA !== bodyB;
        result.body = { a: bodyA, b: bodyB, changed: bodyChanged };
        if (bodyChanged) result.identical = false;
      }

      if (opts.format === "json") {
        console.log(JSON.stringify(result, null, 2));
      } else {
        if (result.identical) {
          console.log(chalk.green("Files are identical"));
          process.exit(0);
        }

        console.log(`${chalk.bold(pathA)} ${chalk.dim("vs")} ${chalk.bold(pathB)}`);
        console.log();

        // Types diff
        if (typesChanged) {
          console.log(`${chalk.yellow("~")} ${chalk.bold("types")}: ${typesA.join(", ") || "(none)"} → ${typesB.join(", ") || "(none)"}`);
        }

        // Field diffs
        for (const f of fields) {
          switch (f.status) {
            case "added":
              console.log(`${chalk.green("+")} ${chalk.bold(f.field)}: ${formatValue(f.b)}`);
              break;
            case "removed":
              console.log(`${chalk.red("-")} ${chalk.bold(f.field)}: ${formatValue(f.a)}`);
              break;
            case "changed":
              console.log(`${chalk.yellow("~")} ${chalk.bold(f.field)}: ${formatValue(f.a)} → ${formatValue(f.b)}`);
              break;
          }
        }

        // Body diff
        if (result.body?.changed) {
          console.log();
          console.log(`${chalk.yellow("~")} ${chalk.bold("body")} differs`);
        }
      }

      process.exit(0);
    });
}
