import { Command } from "commander";

export function registerBase(program: Command): void {
  const base = program
    .command("base")
    .description("Execute Obsidian .base files headlessly");

  base
    .command("run <file>")
    .description("Execute a .base file and output results")
    .option("--view <name>", "Run a specific named view")
    .option("--format <format>", "Output format: table, json, csv, markdown", "table")
    .option("--fields <fields...>", "Override which fields to display")
    .option("--limit <n>", "Override result limit", parseInt)
    .action(async (file: string, opts) => {
      // TODO: implement — parse .base YAML, execute filters/formulas,
      // apply view config, format output
      console.log("base run", file, opts);
    });

  base
    .command("validate <file>")
    .description("Validate a .base file syntax and references")
    .action(async (file: string) => {
      // TODO: implement — parse .base YAML, check filter syntax,
      // verify property references exist
      console.log("base validate", file);
    });

  base
    .command("inspect <file>")
    .description("Show parsed structure of a .base file")
    .option("--format <format>", "Output format: text, json, yaml", "text")
    .action(async (file: string, opts) => {
      // TODO: implement
      console.log("base inspect", file, opts);
    });
}
