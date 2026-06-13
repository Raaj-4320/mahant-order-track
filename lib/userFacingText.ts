const INTERNAL_LINE_PATTERNS = [
  /^order-line-[a-z0-9-]+$/i,
  /^ln-[a-z0-9]+$/i,
  /^line-\d+$/i,
  /^suborder[-_\s]/i,
];

export const sanitizeUserFacingText = (value: string | undefined | null, fallback = "—") => {
  const trimmed = (value || "").trim();
  if (!trimmed) return fallback;
  if (INTERNAL_LINE_PATTERNS.some((pattern) => pattern.test(trimmed))) return fallback;
  return trimmed;
};
