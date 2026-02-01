import { describe, it, expect, afterEach } from "vitest";
import { execFileSync } from "node:child_process";
import { unlinkSync, existsSync } from "node:fs";
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

// Track type files created during tests for cleanup
const createdFiles: string[] = [];

afterEach(() => {
  for (const f of createdFiles) {
    if (existsSync(f)) {
      unlinkSync(f);
    }
  }
  createdFiles.length = 0;
});

function trackTypeFile(name: string): void {
  const fullPath = path.join(VALID, "_types", `${name}.md`);
  createdFiles.push(fullPath);
}

describe("types list command", () => {
  describe("text format", () => {
    it("lists types in the collection", () => {
      const { stdout, exitCode } = run(["types", "list"], VALID);
      expect(exitCode).toBe(0);
      expect(stdout).toContain("note");
      expect(stdout).toContain("4 fields");
    });
  });

  describe("JSON format", () => {
    it("returns array of type summaries", () => {
      const { stdout, exitCode } = run(["types", "list", "--format", "json"], VALID);
      expect(exitCode).toBe(0);
      const parsed = JSON.parse(stdout);
      expect(Array.isArray(parsed)).toBe(true);
      expect(parsed.length).toBeGreaterThanOrEqual(1);
      const note = parsed.find((t: { name: string }) => t.name === "note");
      expect(note).toBeDefined();
      expect(note.name).toBe("note");
      expect(note.fields).toBe(4);
    });
  });

  describe("YAML format", () => {
    it("outputs valid YAML", () => {
      const { stdout, exitCode } = run(["types", "list", "--format", "yaml"], VALID);
      expect(exitCode).toBe(0);
      expect(stdout).toContain("name: note");
      expect(stdout).toContain("fields: 4");
    });
  });

  describe("error handling", () => {
    it("exits 3 when no collection found", () => {
      const { exitCode } = run(["types", "list"], "/tmp");
      expect(exitCode).toBe(3);
    });

    it("exits 3 with JSON error when no collection found", () => {
      const { stdout, exitCode } = run(["types", "list", "--format", "json"], "/tmp");
      expect(exitCode).toBe(3);
      const parsed = JSON.parse(stdout);
      expect(parsed.error).toBeDefined();
    });
  });
});

describe("types show command", () => {
  describe("text format", () => {
    it("shows type details", () => {
      const { stdout, exitCode } = run(["types", "show", "note"], VALID);
      expect(exitCode).toBe(0);
      expect(stdout).toContain("note");
      expect(stdout).toContain("title");
      expect(stdout).toContain("string");
      expect(stdout).toContain("tags");
      expect(stdout).toContain("rating");
      expect(stdout).toContain("integer");
    });

    it("shows field constraints", () => {
      const { stdout, exitCode } = run(["types", "show", "note"], VALID);
      expect(exitCode).toBe(0);
      expect(stdout).toContain("required");
      expect(stdout).toContain("min: 1");
      expect(stdout).toContain("max: 5");
    });
  });

  describe("JSON format", () => {
    it("returns full type definition", () => {
      const { stdout, exitCode } = run(["types", "show", "note", "--format", "json"], VALID);
      expect(exitCode).toBe(0);
      const parsed = JSON.parse(stdout);
      expect(parsed.name).toBe("note");
      expect(parsed.fields).toBeDefined();
      expect(parsed.fields.title.type).toBe("string");
      expect(parsed.fields.title.required).toBe(true);
      expect(parsed.fields.rating.type).toBe("integer");
      expect(parsed.fields.rating.min).toBe(1);
      expect(parsed.fields.rating.max).toBe(5);
      expect(parsed.fields.tags.type).toBe("list");
    });
  });

  describe("YAML format", () => {
    it("outputs valid YAML", () => {
      const { stdout, exitCode } = run(["types", "show", "note", "--format", "yaml"], VALID);
      expect(exitCode).toBe(0);
      expect(stdout).toContain("name: note");
      expect(stdout).toContain("type: string");
      expect(stdout).toContain("required: true");
    });
  });

  describe("error handling", () => {
    it("exits 1 for unknown type", () => {
      const { exitCode, stderr } = run(["types", "show", "nonexistent"], VALID);
      expect(exitCode).toBe(1);
      expect(stderr).toContain("nonexistent");
    });

    it("shows JSON error for unknown type", () => {
      const { stdout, exitCode } = run(["types", "show", "nonexistent", "--format", "json"], VALID);
      expect(exitCode).toBe(1);
      const parsed = JSON.parse(stdout);
      expect(parsed.error).toBeDefined();
      expect(parsed.error.code).toBe("unknown_type");
    });

    it("exits 3 when no collection found", () => {
      const { exitCode } = run(["types", "show", "note"], "/tmp");
      expect(exitCode).toBe(3);
    });
  });
});

describe("types create command", () => {
  describe("text format", () => {
    it("creates a new type", () => {
      trackTypeFile("task");
      const { stdout, exitCode } = run(
        ["types", "create", "task", "-f", "title:string:required", "-f", "done:boolean"],
        VALID,
      );
      expect(exitCode).toBe(0);
      expect(stdout).toContain("created");
      expect(stdout).toContain("type task");
      expect(stdout).toContain("title");
      expect(stdout).toContain("done");
    });
  });

  describe("JSON format", () => {
    it("creates type and returns JSON", () => {
      trackTypeFile("article");
      const { stdout, exitCode } = run(
        ["types", "create", "article", "-f", "title:string:required", "-f", "word-count:integer", "--format", "json"],
        VALID,
      );
      expect(exitCode).toBe(0);
      const parsed = JSON.parse(stdout);
      expect(parsed.name).toBe("article");
      expect(parsed.fields.title.type).toBe("string");
      expect(parsed.fields.title.required).toBe(true);
      expect(parsed.fields["word-count"].type).toBe("integer");
    });
  });

  describe("YAML format", () => {
    it("creates type and outputs YAML", () => {
      trackTypeFile("review");
      const { stdout, exitCode } = run(
        ["types", "create", "review", "-f", "title:string", "--format", "yaml"],
        VALID,
      );
      expect(exitCode).toBe(0);
      expect(stdout).toContain("name: review");
      expect(stdout).toContain("type: string");
    });
  });

  describe("options", () => {
    it("supports --description", () => {
      trackTypeFile("bookmark");
      const { stdout, exitCode } = run(
        ["types", "create", "bookmark", "--description", "Saved web links", "-f", "url:string:required", "--format", "json"],
        VALID,
      );
      expect(exitCode).toBe(0);
      const parsed = JSON.parse(stdout);
      expect(parsed.description).toBe("Saved web links");
    });

    it("supports --extends", () => {
      trackTypeFile("daily");
      const { stdout, exitCode } = run(
        ["types", "create", "daily", "--extends", "note", "-f", "date:date:required", "--format", "json"],
        VALID,
      );
      expect(exitCode).toBe(0);
      const parsed = JSON.parse(stdout);
      expect(parsed.extends).toBe("note");
    });

    it("supports --strict", () => {
      trackTypeFile("config");
      const { stdout, exitCode } = run(
        ["types", "create", "config", "--strict", "-f", "key:string:required", "--format", "json"],
        VALID,
      );
      expect(exitCode).toBe(0);
      const parsed = JSON.parse(stdout);
      expect(parsed.strict).toBe(true);
    });

    it("supports --strict warn", () => {
      trackTypeFile("log");
      const { stdout, exitCode } = run(
        ["types", "create", "log", "--strict", "warn", "-f", "message:string", "--format", "json"],
        VALID,
      );
      expect(exitCode).toBe(0);
      const parsed = JSON.parse(stdout);
      expect(parsed.strict).toBe("warn");
    });

    it("supports enum fields", () => {
      trackTypeFile("issue");
      const { stdout, exitCode } = run(
        ["types", "create", "issue", "-f", "status:enum:open,closed,wip", "--format", "json"],
        VALID,
      );
      expect(exitCode).toBe(0);
      const parsed = JSON.parse(stdout);
      expect(parsed.fields.status.type).toBe("enum");
      expect(parsed.fields.status.values).toEqual(["open", "closed", "wip"]);
    });

    it("supports min/max constraints", () => {
      trackTypeFile("rating-type");
      const { stdout, exitCode } = run(
        ["types", "create", "rating-type", "-f", "score:integer:min=1:max=10", "--format", "json"],
        VALID,
      );
      expect(exitCode).toBe(0);
      const parsed = JSON.parse(stdout);
      expect(parsed.fields.score.min).toBe(1);
      expect(parsed.fields.score.max).toBe(10);
    });
  });

  describe("file creation verification", () => {
    it("creates the type file on disk", () => {
      trackTypeFile("persist-test");
      run(["types", "create", "persist-test", "-f", "name:string"], VALID);
      const typeFilePath = path.join(VALID, "_types", "persist-test.md");
      expect(existsSync(typeFilePath)).toBe(true);
    });

    it("can be read back with types show", () => {
      trackTypeFile("roundtrip");
      run(
        ["types", "create", "roundtrip", "-f", "title:string:required", "-f", "count:integer"],
        VALID,
      );
      const { stdout, exitCode } = run(
        ["types", "show", "roundtrip", "--format", "json"],
        VALID,
      );
      expect(exitCode).toBe(0);
      const parsed = JSON.parse(stdout);
      expect(parsed.name).toBe("roundtrip");
      expect(parsed.fields.title.type).toBe("string");
      expect(parsed.fields.title.required).toBe(true);
      expect(parsed.fields.count.type).toBe("integer");
    });
  });

  describe("error handling", () => {
    it("exits 1 for path conflict (type already exists)", () => {
      const { exitCode, stderr } = run(
        ["types", "create", "note", "-f", "title:string"],
        VALID,
      );
      expect(exitCode).toBe(1);
      expect(stderr).toContain("already exists");
    });

    it("shows JSON error for path conflict", () => {
      const { stdout, exitCode } = run(
        ["types", "create", "note", "-f", "title:string", "--format", "json"],
        VALID,
      );
      expect(exitCode).toBe(1);
      const parsed = JSON.parse(stdout);
      expect(parsed.error.code).toBe("path_conflict");
    });

    it("exits 2 for invalid type name", () => {
      const { exitCode, stderr } = run(
        ["types", "create", "123invalid", "-f", "title:string"],
        VALID,
      );
      expect(exitCode).toBe(2);
      expect(stderr).toContain("invalid");
    });

    it("exits 1 for missing parent type", () => {
      trackTypeFile("orphan");
      const { exitCode, stderr } = run(
        ["types", "create", "orphan", "--extends", "nonexistent", "-f", "title:string"],
        VALID,
      );
      expect(exitCode).toBe(1);
      expect(stderr).toContain("nonexistent");
    });

    it("exits 1 for invalid field format", () => {
      trackTypeFile("bad-field");
      const { exitCode, stderr } = run(
        ["types", "create", "bad-field", "-f", "no-colon"],
        VALID,
      );
      expect(exitCode).toBe(1);
      expect(stderr).toContain("invalid field format");
    });

    it("exits 3 when no collection found", () => {
      const { exitCode } = run(["types", "create", "test", "-f", "title:string"], "/tmp");
      expect(exitCode).toBe(3);
    });
  });
});
