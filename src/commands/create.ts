import { Command } from "commander";

export function registerCreate(program: Command): void {
  program
    .command("create <path>")
    .description("Create a new file with typed frontmatter")
    .option("-t, --type <type>", "Type for the new file")
    .option("-f, --field <fields...>", "Field values as key=value pairs")
    .option("--body <body>", "Body content")
    .option("--template", "Open with all fields from type schema pre-filled")
    .action(async (filePath: string, opts) => {
      // TODO: implement
      console.log("create", filePath, opts);
    });
}
