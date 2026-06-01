import type { OrderLine } from "@/lib/types";

const raw = (value?: string) => value || "";
const clean = (value?: string) => (value || "").trim();

export const getLineDetailsParts = (line: Partial<OrderLine>) => {
  const detail1 = raw(line.detail1);
  const detail2 = raw(line.detail2);
  const detail3 = raw(line.detail3);
  return { detail1, detail2, detail3 };
};

export const joinLineDetails = (line: Partial<OrderLine>) => {
  const { detail1, detail2, detail3 } = getLineDetailsParts(line);
  const joined = [clean(detail1), clean(detail2), clean(detail3)].filter(Boolean).join(" / ");
  return joined || clean(line.details);
};

export const seedDetailBoxesFromLegacy = <T extends Partial<OrderLine>>(line: T): T & Pick<OrderLine, "detail1" | "detail2" | "detail3"> => {
  const hasAnyDetailBox = Boolean(raw(line.detail1) || raw(line.detail2) || raw(line.detail3));
  if (hasAnyDetailBox) return { ...line, detail1: raw(line.detail1), detail2: raw(line.detail2), detail3: raw(line.detail3) };
  return { ...line, detail1: raw(line.details), detail2: "", detail3: "" };
};

export const withDerivedLegacyDetails = <T extends Partial<OrderLine>>(line: T): T & Pick<OrderLine, "details"> => {
  const detail1 = raw(line.detail1);
  const detail2 = raw(line.detail2);
  const detail3 = raw(line.detail3);
  return {
    ...line,
    details: [clean(detail1), clean(detail2), clean(detail3)].filter(Boolean).join(" / "),
  };
};
