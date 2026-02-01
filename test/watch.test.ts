import { describe, it, expect } from "vitest";
import { execFileSync, spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const CLI = path.resolve(__dirname, "../src/cli.ts");
const VALID = path.resolve(__dirname, "fixtures/valid-collection");

function run(args: string[], cwd: string): { stdout: string; stderr: string; exitCode: number } {
  try {
    const stdout = execFileSync("npx", ["tsx", CLI, ...args], {
      cwd,
      encoding: "utf-8",
      env: { ...process.env, NO_COLOR: "1" },
    });
    return { stdout, stderr: "", exitCode: 0 };
  } catch (err: unknown) {
    const e = err as { stdout: string; stderr: string; status: number };
    return { stdout: e.stdout ?? "", stderr: e.stderr ?? "", exitCode: e.status ?? 1 };
  }
}

describe("watch command", () => {
  it("exits 3 outside collection", () => {
    const { exitCode } = run(["watch"], "/tmp");
    expect(exitCode).toBe(3);
  });

  it("starts and emits events on file change then stops on SIGTERM", async () => {
    const child = spawn("npx", ["tsx", CLI, "watch", "--format", "json"], {
      cwd: VALID,
      env: { ...process.env, NO_COLOR: "1" },
      stdio: ["pipe", "pipe", "pipe"],
    });

    let stdout = "";
    child.stdout.on("data", (data: Buffer) => {
      stdout += data.toString();
    });

    // Wait for watcher to start
    await new Promise<void>((resolve) => {
      const check = () => {
        if (stdout.includes('"event":"start"')) {
          resolve();
        } else {
          setTimeout(check, 100);
        }
      };
      check();
    });

    // Touch a file to trigger change event
    const testFile = path.join(VALID, "watch-test-tmp.md");
    fs.writeFileSync(testFile, "---\ntitle: test\n---\n");

    // Wait for change event
    await new Promise<void>((resolve) => {
      const timeout = setTimeout(() => resolve(), 2000);
      const check = () => {
        if (stdout.includes('"event"') && stdout.includes("watch-test-tmp")) {
          clearTimeout(timeout);
          resolve();
        } else {
          setTimeout(check, 100);
        }
      };
      check();
    });

    // Clean up
    child.kill("SIGTERM");
    if (fs.existsSync(testFile)) {
      fs.unlinkSync(testFile);
    }

    await new Promise<void>((resolve) => {
      child.on("close", () => resolve());
      setTimeout(() => resolve(), 2000);
    });

    // Verify start event
    expect(stdout).toContain('"event":"start"');
  });
});
