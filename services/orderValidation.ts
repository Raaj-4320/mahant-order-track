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

export const getMeaningfulOrderLines = (lines: Order["lines"]) => lines.filter(isMeaningfulLine);

export const validateOrderForSave = (order: Order): OrderValidationResult => {
  const missingFields: string[] = [];
  if (!order.date?.trim()) missingFields.push("Date is required.");

  const meaningfulLines = getMeaningfulOrderLines(order.lines);
  if (meaningfulLines.length === 0) missingFields.push("At least one meaningful order line is required.");

  const lineIssues: OrderLineValidationIssue[] = [];

  return { isValid: missingFields.length === 0 && lineIssues.length === 0, missingFields, lineIssues };
};

export const hasAnyDraftContent = (order: Order) => {
  const header = Boolean(
    order.wechatId?.trim()
    || order.paymentBy?.trim()
    || order.paymentAgentId?.trim()
    || (order as Partial<Order> & { paymentByName?: string }).paymentByName?.trim()
    || (order as Partial<Order> & { paymentAgentName?: string }).paymentAgentName?.trim()
    || order.loadingDate?.trim()
    || Number(order.shippingPrice) > 0
    || Number(order.paidToPaymentAgentNow) > 0,
  );
  const lines = order.lines.some((line) => isMeaningfulLine(line));
  return header || lines;
};
