export const APP_ACCESS_SESSION_KEY_PREFIX = "app-access-session";

export async function hashAppAccessPassword(password: string): Promise<string> {
  const normalized = password.trim();
  const data = new TextEncoder().encode(normalized);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest))
    .map((value) => value.toString(16).padStart(2, "0"))
    .join("");
}

export const getAppAccessSessionKey = (businessId: string) => `${APP_ACCESS_SESSION_KEY_PREFIX}:${businessId}`;
