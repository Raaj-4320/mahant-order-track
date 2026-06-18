const DEFAULT_VOLATILE_FIELDS = new Set([
  "updatedAt",
  "draftAutosavedAt",
  "lastEditedAt",
]);

function normalizeValue(value: unknown, volatileFields: Set<string>): unknown {
  if (Array.isArray(value)) {
    return value.map((entry) => normalizeValue(entry, volatileFields));
  }
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([key, entryValue]) => !volatileFields.has(key) && entryValue !== undefined)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entryValue]) => [key, normalizeValue(entryValue, volatileFields)]);
    return Object.fromEntries(entries);
  }
  return value;
}

export function areBusinessValuesEqual(
  left: unknown,
  right: unknown,
  volatileFields: Iterable<string> = DEFAULT_VOLATILE_FIELDS,
): boolean {
  const volatileSet = volatileFields instanceof Set ? volatileFields : new Set(volatileFields);
  return JSON.stringify(normalizeValue(left, volatileSet)) === JSON.stringify(normalizeValue(right, volatileSet));
}
