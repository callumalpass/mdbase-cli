import { Command } from "commander";
import path from "node:path";
import chalk from "chalk";
import { Collection } from "mdbase";
import type { MdbaseError } from "mdbase";

function formatIssue(issue: MdbaseError): string {
  const severity = issue.severity ?? "error";
  const tag =
    severity === "error"
      ? chalk.red("error")
      : severity === "warning"
        ? chalk.yellow("warn")
        : chalk.blue("info");

  const location = issue.path ?? "";
  const field = issue.field ? ` field ${chalk.bold(issue.field)}` : "";
  return `  ${tag} ${chalk.dim(location)}${field}: ${issue.message} ${chalk.dim(`[${issue.code}]`)}`;
}

function formatSummary(
  errors: number,
  warnings: number,
  files: number,
): string {
  const parts: string[] = [];
  if (errors > 0) parts.push(chalk.red(`${errors} error${errors !== 1 ? "s" : ""}`));
  if (warnings > 0) parts.push(chalk.yellow(`${warnings} warning${warnings !== 1 ? "s" : ""}`));
  if (parts.length === 0) parts.push(chalk.green("valid"));
  return `${parts.join(", ")} in ${files} file${files !== 1 ? "s" : ""}`;
}

export function registerValidate(program: Command): void {
  program
    .command("validate [paths...]")
    .description("Validate files or entire collection against type schemas")
    .option("-c, --collection", "Validate the entire collection")
    .option("--level <level>", "Validation level: off, warn, error", "error")
    .option("--format <format>", "Output format: text, json", "text")
    .action(async (paths: string[], opts) => {
      const cwd = process.cwd();

      // Open the collection
      const openResult = Collection.open(cwd);
      if (openResult.error) {
        if (opts.format === "json") {
          console.log(JSON.stringify({ valid: false, error: openResult.error }, null, 2));
        } else {
          console.error(chalk.red(`error: ${openResult.error.message}`));
        }
        process.exit(3);
      }
      const collection = openResult.collection!;

      // Determine what to validate
      const validateCollection = opts.collection || paths.length === 0;

      if (validateCollection) {
        // Validate entire collection
        const result = collection.validate();

        if (opts.format === "json") {
          console.log(JSON.stringify({
            valid: result.valid,
            issues: result.issues,
            summary: {
              errors: result.issues.filter((i) => (i.severity ?? "error") === "error").length,
              warnings: result.issues.filter((i) => i.severity === "warning").length,
            },
          }, null, 2));
        } else {
          for (const issue of result.issues) {
            if (opts.level === "error" && issue.severity === "warning") continue;
            if (opts.level === "off") continue;
            console.log(formatIssue(issue));
          }

          const errors = result.issues.filter((i) => (i.severity ?? "error") === "error").length;
          const warnings = result.issues.filter((i) => i.severity === "warning").length;
          const fileCount = new Set(result.issues.map((i) => i.path).filter(Boolean)).size;
          const totalFiles = fileCount || (result.valid ? 1 : 0);

          if (!result.valid || result.issues.length > 0) {
            console.log(formatSummary(errors, warnings, totalFiles));
          } else {
            console.log(chalk.green("Collection is valid"));
          }
        }

        process.exit(result.valid ? 0 : 2);
      } else {
        // Validate specific files
        let allValid = true;
        const allIssues: MdbaseError[] = [];

        for (const filePath of paths) {
          const relativePath = path.relative(cwd, path.resolve(cwd, filePath));
          const result = collection.validate(relativePath);

          if (result.error) {
            allValid = false;
            allIssues.push({
              code: result.error.code,
              message: result.error.message,
              path: relativePath,
              severity: "error",
            });
            if (opts.format !== "json") {
              console.log(formatIssue({
                code: result.error.code,
                message: result.error.message,
                path: relativePath,
                severity: "error",
              }));
            }
            continue;
          }

          if (!result.valid) allValid = false;
          allIssues.push(...result.issues);

          if (opts.format !== "json") {
            for (const issue of result.issues) {
              if (opts.level === "error" && issue.severity === "warning") continue;
              if (opts.level === "off") continue;
              console.log(formatIssue(issue));
            }
          }
        }

        if (opts.format === "json") {
          console.log(JSON.stringify({
            valid: allValid,
            issues: allIssues,
            summary: {
              errors: allIssues.filter((i) => (i.severity ?? "error") === "error").length,
              warnings: allIssues.filter((i) => i.severity === "warning").length,
            },
          }, null, 2));
        } else {
          const errors = allIssues.filter((i) => (i.severity ?? "error") === "error").length;
          const warnings = allIssues.filter((i) => i.severity === "warning").length;

          if (allIssues.length > 0) {
            console.log(formatSummary(errors, warnings, paths.length));
          } else {
            console.log(chalk.green(
              paths.length === 1
                ? `${paths[0]} is valid`
                : `All ${paths.length} files are valid`,
            ));
          }
        }

        process.exit(allValid ? 0 : 2);
      }
    });
}
