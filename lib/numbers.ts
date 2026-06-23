const DEFAULT_PRECISION = 6;
const MONEY_PRECISION = 2;

export const toNumber = (value: number | string | undefined | null, fallback = 0) => {
  const parsed = typeof value === "string" ? Number(value) : Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : fallback;
};

export const toSafeNumber = (value: number | string | undefined | null) => toNumber(value);

export const roundNumber = (value: number | string | undefined | null, precision = DEFAULT_PRECISION) => {
  const safe = toNumber(value);
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
  values.reduce<number>((sum, value) => roundNumber(sum + toNumber(value), precision), 0);

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
    useGrouping: false,
  });
};

export const roundTotalAmount = (value: number | string | undefined | null) => {
  const safe = roundNumber(value, DEFAULT_PRECISION);
  return Math.floor(safe + Number.EPSILON);
};

export const formatRate = (value: number | string | undefined | null) =>
  formatDisplayNumber(value, {
    minFractionDigits: 0,
    maxFractionDigits: DEFAULT_PRECISION,
  });

export const formatTotalAmount = (value: number | string | undefined | null) =>
  roundTotalAmount(value).toLocaleString("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
    useGrouping: false,
  });

export const floorMoney = (value: number | string | undefined | null, precision = MONEY_PRECISION) => {
  const safe = roundNumber(value, DEFAULT_PRECISION);
  const factor = 10 ** precision;
  return Math.floor((safe + Number.EPSILON) * factor) / factor;
};

export const floorWholeMoney = roundTotalAmount;

export const formatMoney = (value: number | string | undefined | null) =>
  floorMoney(value).toLocaleString("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: MONEY_PRECISION,
    useGrouping: false,
  });

export const formatWholeMoney = formatTotalAmount;
