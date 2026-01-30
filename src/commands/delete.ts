import { Command } from "commander";

export function registerDelete(program: Command): void {
  program
    .command("delete <path>")
    .description("Delete a file from the collection")
    .option("--force", "Skip confirmation")
    .action(async (filePath: string, opts) => {
      // TODO: implement
      console.log("delete", filePath, opts);
    });
}
