export type Supplier = {
  id: string;
  name: string;
};

export type Customer = {
  id: string;
  name: string;
};

export type Product = {
  id: string;
  name: string;
  marka: string;
  photo: string; // emoji or url placeholder
  defaultDim?: string;
};

export type OrderLine = {
  id: string;
  supplierId: string;
  picDim: string;
  productId: string;
  marka: string;
  details: string;
  totalCtns: number;
  pcsPerCtn: number;
  rmbPerPcs: number;
  customerId: string;
  photoUrl?: string;
  productPhotoUrl?: string;
};

export type OrderStatus = "draft" | "saved";

export type Order = {
  id: string;
  number: string;
  date: string;
  paymentBy: string;
  wechatId: string;
  status: OrderStatus;
  lines: OrderLine[];
};

export const lineTotalPcs = (l: OrderLine) =>
  (Number(l.totalCtns) || 0) * (Number(l.pcsPerCtn) || 0);

export const lineTotalRmb = (l: OrderLine) =>
  lineTotalPcs(l) * (Number(l.rmbPerPcs) || 0);

export const orderTotal = (o: Order) =>
  o.lines.reduce((sum, l) => sum + lineTotalRmb(l), 0);
