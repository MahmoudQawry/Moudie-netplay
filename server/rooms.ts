import { createHash, randomBytes } from "node:crypto";

const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export function createJoinCode(length = 6): string {
  const bytes = randomBytes(length);
  return Array.from(bytes, (byte) => ALPHABET[byte % ALPHABET.length]).join("");
}

export function createAccessToken(): string {
  return randomBytes(32).toString("base64url");
}

export function hashAccessToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}
