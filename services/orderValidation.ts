import type { Order } from "@/lib/types";
import { joinLineDetails } from "@/lib/orderLineDetails";

export type OrderLineValidationIssue = {
  lineId: string;
  lineNumber: number;
  issues: string[];
};

export type OrderValidationResult = {
  isValid: boolean;
  missingFields: string[];
  lineIssues: OrderLineValidationIssue[];
};

const hasProductIdentity = (line: Order["lines"][number]) =>
  Boolean(line.marka?.trim() || joinLineDetails(line) || line.productPhotoUrl || line.photoUrl);

const isMeaningfulLine = (line: Order["lines"][number]) =>
  Boolean(
      line.marka?.trim() ||
      joinLineDetails(line) ||
      line.productPhotoUrl ||
      line.photoUrl ||
      Number(line.totalCtns) > 0 ||
      Number(line.pcsPerCtn) > 0 ||
      Number(line.rmbPerPcs) > 0,
  );

export const validateOrderForSave = (order: Order): OrderValidationResult => {
  const missingFields: string[] = [];
  if (!order.date?.trim()) missingFields.push("Date is required.");
  if (!order.wechatId?.trim()) missingFields.push("WeChat ID is required.");

  const meaningfulLines = order.lines.filter(isMeaningfulLine);
  if (meaningfulLines.length === 0) missingFields.push("At least one meaningful order line is required.");

  const lineIssues: OrderLineValidationIssue[] = [];
  order.lines.forEach((line, idx) => {
    const issues: string[] = [];
    if (!isMeaningfulLine(line)) {
      issues.push("Line is blank. Fill required fields or remove it.");
    } else {
      if (!hasProductIdentity(line)) issues.push("MARKA, Details, or product image is required.");
      if (!(Number(line.totalCtns) > 0)) issues.push("CTNs must be greater than 0.");
      if (!(Number(line.pcsPerCtn) > 0)) issues.push("PCS/CTN must be greater than 0.");
      if (!(Number(line.rmbPerPcs) > 0)) issues.push("Rate / PCS must be greater than 0.");
    }
    if (issues.length) lineIssues.push({ lineId: line.id, lineNumber: idx + 1, issues });
  });

  return { isValid: missingFields.length === 0 && lineIssues.length === 0, missingFields, lineIssues };
};

export const hasAnyDraftContent = (order: Order) => {
  const header = Boolean((order.number || order.orderNumber)?.trim() || order.date?.trim() || order.wechatId?.trim() || order.paymentBy || order.paymentAgentId);
  const lines = order.lines.some((line) => isMeaningfulLine(line));
  return header || lines;
};
