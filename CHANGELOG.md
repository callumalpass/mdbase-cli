# Changelog

## 0.3.0-alpha.1 - 2026-07-16
- Default `init` to mdbase v0.3 and generate canonical JSON Schema type wrappers, while retaining explicit v0.2 initialization.
- Add analyzed, approval-gated v0.2-to-v0.3 migration with readable diffs, durable backups, post-apply validation, and recovery.
- Add v0.3-aware CRUD, validation, query, schema, and Obsidian Bases workflows through the updated core.
- Add named collection registry support and machine-readable output across commands.

## 0.1.0 - 2026-02-28
- First npm release of `mdbase-cli`.
- Update core dependency to `@callumalpass/mdbase@^0.2.2` for the latest collection performance and profiling improvements.
- Keep CLI command surface and DX-oriented workflows as documented in `README.md`.
