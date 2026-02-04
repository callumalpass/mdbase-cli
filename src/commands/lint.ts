import { Command } from "commander";
import path from "node:path";
import chalk from "chalk";
import { Collection } from "@callumalpass/mdbase";
import type { MdbaseError } from "@callumalpass/mdbase";
import yaml from "js-yaml";

interface LintIssue {
  path: string;
  field?: string;
  code: string;
  message: string;
  severity: "error" | "warning" | "info";
  fixable: boolean;
}

interface LintResult {
  files: number;
  issues: LintIssue[];
  fixed: number;
  summary: {
    errors: number;
    warnings: number;
    info: number;
    fixable: number;
  };
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

export function registerLint(program: Command): void {
  program
    .command("lint [paths...]")
    .description("Lint frontmatter: check types, defaults, consistency")
    .option("--fix", "Auto-fix issues where possible")
    .option("--format <format>", "Output format: text, json, yaml", "text")
    .action(async (paths: string[], opts) => {
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

      // Determine files to lint
      let filePaths: string[];
      if (paths.length > 0) {
        filePaths = paths.map((p) => path.relative(cwd, path.resolve(cwd, p)));
      } else {
        // Query all files in the collection
        const queryResult = await collection.query({});
        if (queryResult.error) {
          if (opts.format === "json") {
            console.log(JSON.stringify({ error: queryResult.error }, null, 2));
          } else {
            console.error(chalk.red(`error: ${queryResult.error.message}`));
          }
          process.exit(1);
        }
        filePaths = (queryResult.results ?? []).map((r: { path: string }) => r.path);
      }

      const allIssues: LintIssue[] = [];
      let fixedCount = 0;

      for (const filePath of filePaths) {
        const fileIssues = await lintFile(collection, filePath);
        allIssues.push(...fileIssues);

        if (opts.fix) {
          const fixable = fileIssues.filter((i) => i.fixable);
          if (fixable.length > 0) {
            const fixed = await fixFile(collection, filePath);
            if (fixed) {
              fixedCount += fixable.length;
            }
          }
        }
      }

      const result: LintResult = {
        files: filePaths.length,
        issues: allIssues,
        fixed: fixedCount,
        summary: {
          errors: allIssues.filter((i) => i.severity === "error").length,
          warnings: allIssues.filter((i) => i.severity === "warning").length,
          info: allIssues.filter((i) => i.severity === "info").length,
          fixable: allIssues.filter((i) => i.fixable).length,
        },
      };

      switch (opts.format) {
        case "json": {
          console.log(JSON.stringify(result, null, 2));
          break;
        }

        case "yaml": {
          console.log(yaml.dump(result, { lineWidth: -1, noRefs: true }).trimEnd());
          break;
        }

        case "text":
        default: {
          for (const issue of allIssues) {
            const tag = issue.severity === "error"
              ? chalk.red("error")
              : issue.severity === "warning"
                ? chalk.yellow("warn")
                : chalk.blue("info");
            const field = issue.field ? ` ${chalk.bold(issue.field)}` : "";
            const fix = issue.fixable ? chalk.dim(" (fixable)") : "";
            console.log(`  ${tag} ${chalk.dim(issue.path)}${field}: ${issue.message} ${chalk.dim(`[${issue.code}]`)}${fix}`);
          }

          // Summary
          const parts: string[] = [];
          if (result.summary.errors > 0) parts.push(chalk.red(`${result.summary.errors} error${result.summary.errors !== 1 ? "s" : ""}`));
          if (result.summary.warnings > 0) parts.push(chalk.yellow(`${result.summary.warnings} warning${result.summary.warnings !== 1 ? "s" : ""}`));
          if (result.summary.info > 0) parts.push(chalk.blue(`${result.summary.info} info`));

          if (parts.length === 0) {
            console.log(chalk.green(`${filePaths.length} file${filePaths.length !== 1 ? "s" : ""} clean`));
          } else {
            console.log(`${parts.join(", ")} in ${filePaths.length} file${filePaths.length !== 1 ? "s" : ""}`);
            if (result.summary.fixable > 0 && !opts.fix) {
              console.log(chalk.dim(`${result.summary.fixable} fixable with --fix`));
            }
          }

          if (opts.fix && fixedCount > 0) {
            console.log(chalk.green(`fixed ${fixedCount} issue${fixedCount !== 1 ? "s" : ""}`));
          }
          break;
        }
      }

      const hasErrors = result.summary.errors > 0;
      process.exit(hasErrors ? 2 : 0);
    });
}

async function lintFile(collection: Collection, filePath: string): Promise<LintIssue[]> {
  const issues: LintIssue[] = [];

  // Read the file (processed + raw)
  const readResult = await collection.read(filePath) as Awaited<ReturnType<
    Collection["read"]
  >> & {
    warnings?: Array<{ code: string; message: string; field?: string }>;
  };
  if (readResult.error) {
    issues.push({
      path: filePath,
      code: readResult.error.code,
      message: readResult.error.message,
      severity: "error",
      fixable: false,
    });
    return issues;
  }

  const raw = readResult.rawFrontmatter ?? {};
  const processed = readResult.frontmatter ?? {};

  // Run validation
  const validateResult = await collection.validate(filePath);
  for (const vi of validateResult.issues) {
    issues.push({
      path: filePath,
      field: vi.field,
      code: vi.code,
      message: vi.message,
      severity: (vi.severity ?? "error") as "error" | "warning" | "info",
      fixable: false,
    });
  }

  // Check for type coercion differences (raw vs processed)
  for (const key of Object.keys(raw)) {
    const rawVal = raw[key];
    const procVal = processed[key];
    if (rawVal !== undefined && procVal !== undefined && !deepEqual(rawVal, procVal)) {
      // Value was coerced — this is a fixable issue
      issues.push({
        path: filePath,
        field: key,
        code: "type_coercion",
        message: `value was coerced: ${JSON.stringify(rawVal)} → ${JSON.stringify(procVal)}`,
        severity: "info",
        fixable: true,
      });
    }
  }

  // Check for missing defaults (fields in processed but not in raw)
  for (const key of Object.keys(processed)) {
    if (!(key in raw) && !isComputedField(key)) {
      issues.push({
        path: filePath,
        field: key,
        code: "missing_default",
        message: `default applied: ${key} = ${JSON.stringify(processed[key])}`,
        severity: "info",
        fixable: true,
      });
    }
  }

  // Check for warnings from read (e.g. deprecated fields)
  if (readResult.warnings) {
    for (const w of readResult.warnings) {
      // Skip if already reported by validation
      if (!issues.some((i) => i.code === w.code && i.field === (w as { field?: string }).field)) {
        issues.push({
          path: filePath,
          field: (w as { field?: string }).field,
          code: w.code,
          message: w.message,
          severity: "warning",
          fixable: false,
        });
      }
    }
  }

  return issues;
}

function isComputedField(_key: string): boolean {
  // Computed fields exist only in read results, not on disk.
  // We can't easily detect these without type info, but they
  // won't appear in rawFrontmatter at all, so the "not in raw"
  // check is sufficient.
  return false;
}

async function fixFile(collection: Collection, filePath: string): Promise<boolean> {
  // Read the processed frontmatter (with defaults applied, types coerced)
  const readResult = await collection.read(filePath) as Awaited<ReturnType<
    Collection["read"]
  >> & {
    warnings?: Array<{ code: string; message: string; field?: string }>;
  };
  if (readResult.error || !readResult.frontmatter) return false;

  const raw = readResult.rawFrontmatter ?? {};
  const processed = readResult.frontmatter ?? {};

  // Build a fields object with only the values that need fixing
  const fixes: Record<string, unknown> = {};

  // Apply coerced values
  for (const key of Object.keys(raw)) {
    const rawVal = raw[key];
    const procVal = processed[key];
    if (rawVal !== undefined && procVal !== undefined && !deepEqual(rawVal, procVal)) {
      fixes[key] = procVal;
    }
  }

  // Apply missing defaults
  for (const key of Object.keys(processed)) {
    if (!(key in raw)) {
      fixes[key] = processed[key];
    }
  }

  if (Object.keys(fixes).length === 0) return false;

  const updateResult = await collection.update({ path: filePath, fields: fixes });
  return !updateResult.error;
}
