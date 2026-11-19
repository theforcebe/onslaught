import type { Env } from "./worker";

const encoder = new TextEncoder();
export const base64url = (bytes: Uint8Array) =>
  btoa(String.fromCharCode(...bytes))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replaceAll("=", "");

export async function pseudonym(id: string, keyValue: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(keyValue),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return base64url(
    new Uint8Array(
      await crypto.subtle.sign("HMAC", key, encoder.encode(`battlenet:${id}`)),
    ),
  );
}

export function adminSubjects(env: Env) {
  return (env.ADMIN_BNET_IDS || "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
}

export async function bootstrapAdminMemberIds(env: Env) {
  return Promise.all(
    adminSubjects(env).map((subject) => pseudonym(subject, env.IDENTITY_KEY)),
  );
}
