import { Command } from "commander";

export function registerRename(program: Command): void {
  program
    .command("rename <from> <to>")
    .description("Rename/move a file, updating references")
    .option("--dry-run", "Show what would change without modifying files")
    .option("--no-refs", "Skip reference updates")
    .action(async (from: string, to: string, opts) => {
      // TODO: implement
      console.log("rename", from, to, opts);
    });
}
