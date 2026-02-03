export function splitList(value: string | undefined): string[] | undefined {
  if (value === undefined) return undefined;
  const parts = value.split(",").map((s) => s.trim()).filter((s) => s.length > 0);
  if (parts.length === 0) return undefined;
  return parts;
}
