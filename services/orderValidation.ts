import type { Order } from "@/lib/types";
import { joinLineDetails } from "@/lib/orderLineDetails";
import { getOrderPaymentAgentSplits } from "@/services/settlement/paymentAgentSplits";

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
  const hasPaymentAgentDraftContent =
    getOrderPaymentAgentSplits(order).some((split) =>
      Boolean(
        split.paymentAgentId?.trim()
        || split.paymentBy?.trim()
        || split.paymentAgentName?.trim()
        || split.paymentAgentSnapshot?.name?.trim()
        || Number(split.assignedAmount) > 0
        || Number(split.paidNow) > 0,
      ),
    )
    || (order.paymentAgentPaymentEvents ?? []).some((event) =>
      Boolean(
        event.paymentAgentId?.trim()
        || event.paymentBy?.trim()
        || event.paymentAgentName?.trim()
        || event.paymentAgentSnapshot?.name?.trim()
        || Number(event.amount) > 0,
      ),
    );
  const header = Boolean(
    order.wechatId?.trim()
    || hasPaymentAgentDraftContent
    || order.loadingDate?.trim()
    || Number(order.shippingPrice) > 0
  );
  const lines = order.lines.some((line) => isMeaningfulLine(line));
  return header || lines;
};
