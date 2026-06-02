import { getFirebaseConfigStatus } from "@/lib/firebase/client";

export type DataSourceSelection = {
  source: "mock" | "firebase";
  reason: string;
  hasFirebaseConfig: boolean;
  missingFirebaseKeys: readonly string[];
  explicitSource?: string;
  explicitMockEnabled: boolean;
  businessId: string | null;
  hasBusinessId: boolean;
};

const normalizeSource = (value: string | undefined): "mock" | "firebase" | undefined => {
  if (value === "mock" || value === "firebase") return value;
  return undefined;
};

export const selectDataSource = (explicitSource: string | undefined): DataSourceSelection => {
  const firebase = getFirebaseConfigStatus();
  const source = normalizeSource(explicitSource);
  const explicitMockEnabled = process.env.NEXT_PUBLIC_USE_MOCK_DATA === "true";

  if (explicitMockEnabled) {
    return { source: "mock", reason: "explicit_mock_flag", hasFirebaseConfig: firebase.hasFirebaseConfig, missingFirebaseKeys: firebase.missingKeys, explicitSource, explicitMockEnabled, businessId: firebase.businessId, hasBusinessId: firebase.hasBusinessId };
  }
  if (source === "mock") {
    return { source: "mock", reason: "explicit_source_mock", hasFirebaseConfig: firebase.hasFirebaseConfig, missingFirebaseKeys: firebase.missingKeys, explicitSource, explicitMockEnabled, businessId: firebase.businessId, hasBusinessId: firebase.hasBusinessId };
  }
  if (source === "firebase" && !firebase.hasFirebaseConfig) {
    return { source: "mock", reason: "firebase_requested_but_config_missing", hasFirebaseConfig: false, missingFirebaseKeys: firebase.missingKeys, explicitSource, explicitMockEnabled, businessId: firebase.businessId, hasBusinessId: firebase.hasBusinessId };
  }
  if (firebase.hasFirebaseConfig) {
    return { source: "firebase", reason: source === "firebase" ? "explicit_source_firebase" : "firebase_config_present", hasFirebaseConfig: true, missingFirebaseKeys: [], explicitSource, explicitMockEnabled, businessId: firebase.businessId, hasBusinessId: firebase.hasBusinessId };
  }
  return { source: "mock", reason: "firebase_config_missing", hasFirebaseConfig: false, missingFirebaseKeys: firebase.missingKeys, explicitSource, explicitMockEnabled, businessId: firebase.businessId, hasBusinessId: firebase.hasBusinessId };
};

export const ordersDataSourceSelection = () => selectDataSource(process.env.NEXT_PUBLIC_ORDERS_DATA_SOURCE);
export const customersDataSourceSelection = () => selectDataSource(process.env.NEXT_PUBLIC_CUSTOMERS_DATA_SOURCE ?? process.env.NEXT_PUBLIC_ORDERS_DATA_SOURCE);
export const paymentAgentsDataSourceSelection = () => selectDataSource(process.env.NEXT_PUBLIC_PAYMENT_AGENTS_DATA_SOURCE ?? process.env.NEXT_PUBLIC_ORDERS_DATA_SOURCE);

export const productsDataSource = (): "mock" | "firebase" => (process.env.NEXT_PUBLIC_PRODUCTS_DATA_SOURCE === "firebase" ? "firebase" : "mock");
export const paymentAgentsDataSource = (): "mock" | "firebase" => paymentAgentsDataSourceSelection().source;
export const ordersDataSource = (): "mock" | "firebase" => ordersDataSourceSelection().source;
export const isDemoDataEnabled = (): boolean => process.env.NEXT_PUBLIC_USE_DEMO_DATA === "true";
export const devSeedEnabled = (): boolean => process.env.NEXT_PUBLIC_ENABLE_DEV_SEED === "true";
export const isDevResetEnabled = (): boolean => process.env.NEXT_PUBLIC_ENABLE_DEV_RESET === "true";
export const isMaintenanceToolsEnabled = (): boolean => process.env.NEXT_PUBLIC_ENABLE_MAINTENANCE === "true";
export const isAuthRequiredModeEnabled = (): boolean => process.env.NEXT_PUBLIC_REQUIRE_AUTH === "true";
export const isAnyFirebaseModeEnabled = (): boolean => productsDataSource() === "firebase" || paymentAgentsDataSource() === "firebase" || ordersDataSource() === "firebase";
