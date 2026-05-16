export const productsDataSource = (): "mock" | "firebase" => (process.env.NEXT_PUBLIC_PRODUCTS_DATA_SOURCE === "firebase" ? "firebase" : "mock");
export const paymentAgentsDataSource = (): "mock" | "firebase" => (process.env.NEXT_PUBLIC_PAYMENT_AGENTS_DATA_SOURCE === "firebase" ? "firebase" : "mock");
export const ordersDataSource = (): "mock" | "firebase" => (process.env.NEXT_PUBLIC_ORDERS_DATA_SOURCE === "firebase" ? "firebase" : "mock");
export const isDemoDataEnabled = (): boolean => process.env.NEXT_PUBLIC_USE_DEMO_DATA === "true";
export const devSeedEnabled = (): boolean => process.env.NEXT_PUBLIC_ENABLE_DEV_SEED === "true";
export const isAnyFirebaseModeEnabled = (): boolean => productsDataSource() === "firebase" || paymentAgentsDataSource() === "firebase" || ordersDataSource() === "firebase";
