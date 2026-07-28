import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const packageRoot = resolve(import.meta.dirname, "..");
const manifest = JSON.parse(
  readFileSync(resolve(packageRoot, "package.json"), "utf8"),
);

if (manifest.private !== true) {
  throw new Error("The retired TypeScript package must remain private");
}
for (const entrypoint of ["main", "types", "bin"]) {
  if (entrypoint in manifest) {
    throw new Error(`The retired package must not expose a ${entrypoint} entry point`);
  }
}
if (!Array.isArray(manifest.files) || manifest.files.length !== 0) {
  throw new Error("The retired package must have an explicitly empty files allowlist");
}

const runNpm = (args) => {
  if (process.env.npm_execpath) {
    return execFileSync(process.execPath, [process.env.npm_execpath, ...args], {
      cwd: packageRoot,
      encoding: "utf8",
    });
  }
  return execFileSync("npm", args, {
    cwd: packageRoot,
    encoding: "utf8",
    shell: process.platform === "win32",
  });
};

const packed = JSON.parse(runNpm(["pack", "--dry-run", "--json"]));
const files = packed[0]?.files?.map((file) => file.path) ?? [];
const forbidden = files.filter(
  (path) =>
    path === "mdbase-fzf" ||
    path === "dist/cli.js" ||
    path.startsWith("dist/"),
);
if (forbidden.length > 0) {
  throw new Error(
    `The retired package still includes executable output: ${forbidden.join(", ")}`,
  );
}
