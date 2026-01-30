import { Command } from "commander";

export function registerQuery(program: Command): void {
  program
    .command("query <expression>")
    .description("Query files using mdbase expression syntax")
    .option("-t, --types <types...>", "Filter by type names")
    .option("-f, --folder <folder>", "Restrict to folder")
    .option("--order-by <field>", "Sort by field")
    .option("--desc", "Sort descending")
    .option("--limit <n>", "Limit results", parseInt)
    .option("--offset <n>", "Skip results", parseInt)
    .option("--format <format>", "Output format: table, json, csv, paths", "table")
    .option("--fields <fields...>", "Fields to include in output")
    .action(async (expression: string, opts) => {
      // TODO: implement
      console.log("query", expression, opts);
    });
}
