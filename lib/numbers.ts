const DEFAULT_PRECISION = 6;

export const toSafeNumber = (value: number | string | undefined | null) => {
  const parsed = typeof value === "string" ? Number(value) : Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
};

export const roundNumber = (value: number | string | undefined | null, precision = DEFAULT_PRECISION) => {
  const safe = toSafeNumber(value);
  const factor = 10 ** precision;
  return Math.round((safe + Number.EPSILON) * factor) / factor;
};

export const multiplyNumbers = (
  left: number | string | undefined | null,
  right: number | string | undefined | null,
  precision = DEFAULT_PRECISION,
) => roundNumber(roundNumber(left, precision) * roundNumber(right, precision), precision);

export const addNumbers = (
  values: Array<number | string | undefined | null>,
  precision = DEFAULT_PRECISION,
) =>
  values.reduce<number>((sum, value) => roundNumber(sum + toSafeNumber(value), precision), 0);

export const formatDisplayNumber = (
  value: number | string | undefined | null,
  options?: {
    maxFractionDigits?: number;
    minFractionDigits?: number;
  },
) => {
  const rounded = roundNumber(value, Math.max(options?.maxFractionDigits ?? DEFAULT_PRECISION, DEFAULT_PRECISION));
  return rounded.toLocaleString("en-US", {
    minimumFractionDigits: options?.minFractionDigits ?? 0,
    maximumFractionDigits: options?.maxFractionDigits ?? DEFAULT_PRECISION,
  });
};
