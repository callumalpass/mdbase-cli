import { Command } from "commander";

export function registerImport(program: Command): void {
  const imp = program
    .command("import")
    .description("Import data into the collection");

  imp
    .command("csv <file>")
    .description("Import from CSV file")
    .option("-t, --type <type>", "Type for imported files")
    .option("--path-field <field>", "CSV column to use as file path")
    .option("--dry-run", "Show what would be created without writing files")
    .action(async (file: string, opts) => {
      // TODO: implement
      console.log("import csv", file, opts);
    });

  imp
    .command("json <file>")
    .description("Import from JSON file")
    .option("-t, --type <type>", "Type for imported files")
    .option("--dry-run", "Show what would be created without writing files")
    .action(async (file: string, opts) => {
      // TODO: implement
      console.log("import json", file, opts);
    });
}
