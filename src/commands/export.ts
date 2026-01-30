import { Command } from "commander";

export function registerExport(program: Command): void {
  program
    .command("export")
    .description("Export collection data to various formats")
    .option("-t, --types <types...>", "Filter by type names")
    .option("-w, --where <expression>", "Filter expression")
    .option("--format <format>", "Output format: json, csv, sqlite", "json")
    .option("-o, --output <file>", "Output file (default: stdout)")
    .option("--fields <fields...>", "Fields to include")
    .action(async (opts) => {
      // TODO: implement
      console.log("export", opts);
    });
}
