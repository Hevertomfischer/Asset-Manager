import { createHash, timingSafeEqual } from "node:crypto";

/** Only this digest is persisted; the bearer value is returned once to its client. */
export function hashMcpAccessToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

export function isS256Challenge(challenge: string, method: string): boolean {
  return typeof challenge === "string" && method === "S256" && /^[A-Za-z0-9_-]{43}$/.test(challenge);
}

export function verifyS256Pkce(verifier: string, challenge: string, method: string): boolean {
  if (typeof verifier !== "string" || !isS256Challenge(challenge, method) ||
      !/^[A-Za-z0-9._~-]{43,128}$/.test(verifier)) return false;
  const digest = createHash("sha256").update(verifier, "ascii").digest("base64url");
  return timingSafeEqual(Buffer.from(digest), Buffer.from(challenge));
}
