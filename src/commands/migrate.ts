import fs from "node:fs";
import path from "node:path";
import { Command } from "commander";

interface MigrationDiagnostic {
  code: string;
  message: string;
  path?: string;
}

interface MigrationReport {
  report_version: string;
  analysis_id: string;
  source_version: string;
  target_version: string;
  applicable: boolean;
  operations: Array<{
    path: string;
    operation: string;
    source_sha256: string;
    target_sha256?: string;
  }>;
  generated_file_evidence: Array<{ path: string; recognized: boolean; reasons: string[] }>;
  warnings: MigrationDiagnostic[];
  unsupported: Array<{ path: string; feature: string }>;
  invalid_records: Array<{ path: string; diagnostics: MigrationDiagnostic[] }>;
  target_diagnostics: MigrationDiagnostic[];
  backup: { required: true; location: string };
  post_apply_validation: { status: string; diagnostics: MigrationDiagnostic[] };
}

interface MigrationAnalysis {
  valid: boolean;
  report?: MigrationReport;
  proposedFiles?: Record<string, string | null>;
  error?: { code: string; message: string };
}

interface MigrationApplyResult {
  valid: boolean;
  report?: MigrationReport;
  restored?: boolean;
  manual_recovery_paths?: string[];
  error?: { code: string; message: string };
}

interface MigrationRecoveryResult {
  valid: boolean;
  restored_paths?: string[];
  manual_recovery_paths?: string[];
  error?: { code: string; message: string };
}

interface MigrationApi {
  analyzeV02CollectionMigration?: (root: string) => Promise<MigrationAnalysis>;
  applyV02CollectionMigration?: (
    root: string,
    report: MigrationReport,
    options?: { allowPartial?: boolean },
  ) => Promise<MigrationApplyResult>;
  recoverV02CollectionMigration?: (
    root: string,
    backupLocation: string,
  ) => Promise<MigrationRecoveryResult>;
}

export function registerMigrate(program: Command): void {
  const migrate = program
    .command("migrate")
    .description("Analyze and safely apply collection format migrations");
  const v03 = migrate
    .command("v0.3")
    .alias("0.3")
    .description("Migrate a v0.2.x collection to v0.3");

  v03
    .command("analyze")
    .description("Analyze a v0.2.x collection without modifying it")
    .option("--report <path>", "Write the machine-readable report to an explicit path")
    .option("--format <format>", "Output format: text or json", "text")
    .action(async (options: { report?: string; format: string }) => {
      const api = await loadMigrationApi(options.format);
      if (!api) return;
      const analysis = await api.analyzeV02CollectionMigration!(process.cwd());
      if (!analysis.valid || !analysis.report) {
        outputError(options.format, analysis.error ?? { code: "migration_analysis_failed", message: "Migration analysis failed." });
        process.exitCode = 2;
        return;
      }

      if (options.report) {
        const reportPath = path.resolve(process.cwd(), options.report);
        await fs.promises.mkdir(path.dirname(reportPath), { recursive: true });
        await fs.promises.writeFile(reportPath, `${JSON.stringify(analysis.report, null, 2)}\n`);
      }

      if (options.format === "json") {
        console.log(JSON.stringify(analysis.report, null, 2));
      } else {
        console.log(await formatAnalysis(analysis.report, analysis.proposedFiles ?? {}, process.cwd(), options.report));
      }
      process.exitCode = analysis.report.applicable ? 0 : 2;
    });

  v03
    .command("apply")
    .description("Apply a reviewed v0.3 migration report with backup and rollback")
    .requiredOption("--report <path>", "Analysis report produced by migrate v0.3 analyze")
    .option("--yes", "Confirm that the analyzed writes may be applied")
    .option("--allow-partial", "Allow documented unsupported features or invalid records")
    .option("--format <format>", "Output format: text or json", "text")
    .action(async (options: { report: string; yes?: boolean; allowPartial?: boolean; format: string }) => {
      if (!options.yes) {
        outputError(options.format, {
          code: "approval_required",
          message: "Apply requires --yes after reviewing the analysis report.",
        });
        process.exitCode = 1;
        return;
      }

      let report: MigrationReport;
      try {
        const parsed: unknown = JSON.parse(await fs.promises.readFile(path.resolve(process.cwd(), options.report), "utf8"));
        if (!isMigrationReport(parsed)) throw new Error("Report is missing required migration fields.");
        report = parsed;
      } catch (error) {
        outputError(options.format, {
          code: "invalid_migration_report",
          message: error instanceof Error ? error.message : String(error),
        });
        process.exitCode = 1;
        return;
      }

      const api = await loadMigrationApi(options.format);
      if (!api) return;
      const result = await api.applyV02CollectionMigration!(process.cwd(), report, {
        allowPartial: options.allowPartial,
      });
      if (options.format === "json") {
        console.log(JSON.stringify(result, null, 2));
      } else if (result.valid && result.report) {
        console.log(`migrated ${result.report.source_version} -> ${result.report.target_version}`);
        console.log(`backup: ${result.report.backup.location}`);
        console.log(`validation: ${result.report.post_apply_validation.status}`);
      } else {
        const error = result.error ?? { code: "migration_apply_failed", message: "Migration apply failed." };
        console.error(`error: ${error.message} [${error.code}]`);
        if (result.restored) console.error("rollback: restored original files");
        if (result.manual_recovery_paths?.length) {
          console.error(`manual recovery required: ${result.manual_recovery_paths.join(", ")}`);
        }
      }
      process.exitCode = result.valid ? 0 : 2;
    });

  v03
    .command("recover")
    .description("Restore an interrupted or applied migration from its verified backup")
    .requiredOption("--backup <path>", "Backup location reported by migrate v0.3 apply")
    .option("--yes", "Confirm that current migrated files may be replaced by their backups")
    .option("--format <format>", "Output format: text or json", "text")
    .action(async (options: { backup: string; yes?: boolean; format: string }) => {
      if (!options.yes) {
        outputError(options.format, {
          code: "approval_required",
          message: "Recovery requires --yes because it replaces current files with verified backups.",
        });
        process.exitCode = 1;
        return;
      }
      const api = await loadMigrationApi(options.format);
      if (!api?.recoverV02CollectionMigration) return;
      const result = await api.recoverV02CollectionMigration(process.cwd(), options.backup);
      if (options.format === "json") {
        console.log(JSON.stringify(result, null, 2));
      } else if (result.valid) {
        console.log(`restored ${result.restored_paths?.length ?? 0} migration file(s)`);
        for (const restoredPath of result.restored_paths ?? []) console.log(`  ${restoredPath}`);
      } else {
        const error = result.error ?? { code: "recovery_failed", message: "Migration recovery failed." };
        console.error(`error: ${error.message} [${error.code}]`);
        if (result.manual_recovery_paths?.length) {
          console.error(`manual recovery required: ${result.manual_recovery_paths.join(", ")}`);
        }
      }
      process.exitCode = result.valid ? 0 : 2;
    });
}

async function loadMigrationApi(format: string): Promise<MigrationApi | undefined> {
  const api = await import("@callumalpass/mdbase") as unknown as MigrationApi;
  if (
    typeof api.analyzeV02CollectionMigration === "function" &&
    typeof api.applyV02CollectionMigration === "function" &&
    typeof api.recoverV02CollectionMigration === "function"
  ) {
    return api;
  }
  outputError(format, {
    code: "migration_api_unavailable",
    message: "This command requires @callumalpass/mdbase 0.3.0 or newer.",
  });
  process.exitCode = 3;
  return undefined;
}

async function formatAnalysis(
  report: MigrationReport,
  proposedFiles: Record<string, string | null>,
  root: string,
  reportPath?: string,
): Promise<string> {
  const lines = [
    `mdbase ${report.source_version} -> ${report.target_version}`,
    `analysis: ${report.analysis_id}`,
    `applicable: ${report.applicable ? "yes" : "no"}`,
    `backup: ${report.backup.location}`,
  ];
  if (reportPath) lines.push(`report: ${reportPath}`);

  for (const operation of report.operations) {
    lines.push(
      "",
      `--- a/${operation.path}`,
      operation.operation === "delete" ? "+++ /dev/null" : `+++ b/${operation.path}`,
    );
    const before = await fs.promises.readFile(path.join(root, operation.path), "utf8");
    const after = proposedFiles[operation.path];
    if (after === undefined) {
      lines.push(
        `- sha256:${operation.source_sha256}`,
        `+ sha256:${operation.target_sha256 ?? "deleted"}`,
      );
    } else {
      lines.push(...compactLineDiff(before, after ?? ""));
    }
  }

  if (report.unsupported.length > 0) {
    lines.push("", "Unsupported:");
    for (const item of report.unsupported) lines.push(`  ${item.path}: ${item.feature}`);
  }
  if (report.invalid_records.length > 0) {
    lines.push("", "Invalid records:");
    for (const item of report.invalid_records) lines.push(`  ${item.path}: ${item.diagnostics.map((diagnostic) => diagnostic.code).join(", ")}`);
  }
  if (report.target_diagnostics.length > 0) {
    lines.push("", "Invalid target:");
    for (const item of report.target_diagnostics) lines.push(`  ${item.path ?? "<collection>"}: ${item.message} [${item.code}]`);
  }
  if (report.warnings.length > 0) {
    lines.push("", "Warnings:");
    for (const warning of report.warnings) lines.push(`  ${warning.path ?? "<collection>"}: ${warning.message} [${warning.code}]`);
  }
  return lines.join("\n");
}

function compactLineDiff(before: string, after: string): string[] {
  const oldLines = before.split("\n");
  const newLines = after.split("\n");
  let prefix = 0;
  while (prefix < oldLines.length && prefix < newLines.length && oldLines[prefix] === newLines[prefix]) prefix += 1;
  let suffix = 0;
  while (
    suffix < oldLines.length - prefix &&
    suffix < newLines.length - prefix &&
    oldLines[oldLines.length - 1 - suffix] === newLines[newLines.length - 1 - suffix]
  ) suffix += 1;

  const contextStart = Math.max(0, prefix - 2);
  const oldEnd = oldLines.length - suffix;
  const newEnd = newLines.length - suffix;
  const result = [`@@ lines ${prefix + 1} @@`];
  for (const line of oldLines.slice(contextStart, prefix)) result.push(` ${line}`);
  for (const line of oldLines.slice(prefix, oldEnd).slice(0, 80)) result.push(`-${line}`);
  if (oldEnd - prefix > 80) result.push(`-... ${oldEnd - prefix - 80} lines omitted`);
  for (const line of newLines.slice(prefix, newEnd).slice(0, 80)) result.push(`+${line}`);
  if (newEnd - prefix > 80) result.push(`+... ${newEnd - prefix - 80} lines omitted`);
  for (const line of newLines.slice(newEnd, Math.min(newLines.length, newEnd + 2))) result.push(` ${line}`);
  return result;
}

function outputError(format: string, error: { code: string; message: string }): void {
  if (format === "json") console.log(JSON.stringify({ valid: false, error }, null, 2));
  else console.error(`error: ${error.message} [${error.code}]`);
}

function isMigrationReport(value: unknown): value is MigrationReport {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const report = value as Partial<MigrationReport>;
  return typeof report.report_version === "string" &&
    typeof report.analysis_id === "string" &&
    typeof report.source_version === "string" &&
    typeof report.target_version === "string" &&
    Array.isArray(report.operations);
}
