import { Command } from "commander";

export function registerTypes(program: Command): void {
  const types = program
    .command("types")
    .description("Manage type definitions");

  types
    .command("list")
    .description("List all type definitions")
    .option("--format <format>", "Output format: text, json", "text")
    .action(async (opts) => {
      // TODO: implement
      console.log("types list", opts);
    });

  types
    .command("show <name>")
    .description("Show details of a type definition")
    .option("--format <format>", "Output format: text, json, yaml", "text")
    .action(async (name: string, opts) => {
      // TODO: implement
      console.log("types show", name, opts);
    });

  types
    .command("create <name>")
    .description("Create a new type definition")
    .option("--extends <parent>", "Parent type to extend")
    .option("--strict", "Enable strict mode")
    .action(async (name: string, opts) => {
      // TODO: implement
      console.log("types create", name, opts);
    });
}
