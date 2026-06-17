export const APP_ACCESS_SESSION_KEY_PREFIX = "app-access-session";
export const APP_ACCESS_PASSWORD_VERSION = 2;

const bytesToHex = (bytes: Uint8Array) =>
  Array.from(bytes)
    .map((value) => value.toString(16).padStart(2, "0"))
    .join("");

export function createAppAccessSalt() {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return bytesToHex(bytes);
}

export async function hashAppAccessPassword(password: string, salt: string): Promise<string> {
  const normalized = password.trim();
  const keyMaterial = await crypto.subtle.importKey("raw", new TextEncoder().encode(normalized), "PBKDF2", false, ["deriveBits"]);
  const derived = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      salt: new TextEncoder().encode(salt),
      iterations: 120000,
      hash: "SHA-256",
    },
    keyMaterial,
    256,
  );
  return bytesToHex(new Uint8Array(derived));
}

export const getAppAccessSessionKey = (businessId: string) => `${APP_ACCESS_SESSION_KEY_PREFIX}:${businessId}`;
