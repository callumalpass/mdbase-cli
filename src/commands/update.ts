import { Command } from "commander";

export function registerUpdate(program: Command): void {
  program
    .command("update <path>")
    .description("Update fields in an existing file")
    .option("-f, --field <fields...>", "Field values as key=value pairs")
    .option("--body <body>", "Replace body content")
    .action(async (filePath: string, opts) => {
      // TODO: implement
      console.log("update", filePath, opts);
    });
}
