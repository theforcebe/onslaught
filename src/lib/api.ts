import { StateSchema } from "./model";
import type { ChangeRequest, Identity } from "./model";
import { ViewSchema, PUBLIC_ACCESS } from "./access";
import type { GuildView, Member } from "./access";
export const REPOSITORY = "theforcebe/onslaught";
export const REPO_URL = `https://github.com/${REPOSITORY}`;
export const API_URL = (import.meta.env.VITE_API_URL || "").replace(/\/$/, "");
let sessionToken = "";
let sessionEpoch = 0;
export const sessionActive = () => !!sessionToken;
async function api(path: string, body?: unknown): Promise<GuildView> {
  const epoch = sessionEpoch;
  const r = await fetch(`${API_URL}${path}`, {
    method: body === undefined ? "GET" : "POST",
    headers: {
      ...(sessionToken ? { Authorization: `Bearer ${sessionToken}` } : {}),
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    cache: "no-store",
    signal: AbortSignal.timeout(15000),
  });
  const data = await r.json();
  if (epoch !== sessionEpoch)
    throw new Error("Session changed. Refresh the guild view.");
  if (r.status === 401) {
    sessionToken = "";
    sessionEpoch++;
  }
  if (!r.ok) throw new Error(data.error || "The guild could not be loaded.");
  return ViewSchema.parse(data);
}
export async function loadGuild(): Promise<GuildView & { isCurrent: boolean }> {
  if (API_URL)
    return {
      ...(await api(sessionToken ? "/api/state" : "/api/public")),
      isCurrent: true,
    };
  const r = await fetch(`${import.meta.env.BASE_URL}data/raid-state.json`, {
    cache: "no-store",
    signal: AbortSignal.timeout(10000),
  });
  if (!r.ok)
    throw new Error(
      "The guild data could not be loaded. Check your connection and reload.",
    );
  return {
    state: StateSchema.parse(await r.json()),
    access: { ...PUBLIC_ACCESS },
    isCurrent: false,
  };
}
export async function loginBattleNet(): Promise<Identity> {
  if (!API_URL)
    throw new Error(
      "Battle.net sign-in needs the guild’s secure gateway. Shared changes become available when the owner completes setup.",
    );
  const popup = window.open(
    "about:blank",
    "onslaught-signin",
    "width=600,height=740",
  );
  if (!popup) throw new Error("Allow pop-ups to sign in with Battle.net.");
  const verifier = crypto.randomUUID() + crypto.randomUUID();
  const bytes = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(verifier),
  );
  const challenge = btoa(String.fromCharCode(...new Uint8Array(bytes)))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replaceAll("=", "");
  return new Promise((resolve, reject) => {
    const clean = () => {
      window.removeEventListener("message", listener);
      clearInterval(closed);
      clearTimeout(timeout);
    };
    const listener = async (e: MessageEvent) => {
      if (
        e.origin !== new URL(API_URL).origin ||
        e.source !== popup ||
        e.data?.type !== "onslaught-auth"
      )
        return;
      clean();
      popup.close();
      try {
        if (e.data.error)
          throw new Error(
            "Battle.net sign-in could not be completed. Try again or contact a guild admin.",
          );
        const r = await fetch(`${API_URL}/auth/exchange`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ code: e.data.code, verifier }),
        });
        const data = await r.json();
        if (!r.ok)
          throw new Error(
            data.accountId
              ? `Your account needs a guild invitation. Give your account ID ${data.accountId} to the guild owner privately.`
              : data.error || "Sign-in expired. Try again.",
          );
        sessionToken = data.token;
        sessionEpoch++;
        resolve(data.identity);
      } catch (error) {
        reject(error);
      }
    };
    window.addEventListener("message", listener);
    const closed = setInterval(() => {
      if (popup.closed) {
        clean();
        reject(new Error("Sign-in window closed."));
      }
    }, 500);
    const timeout = setTimeout(() => {
      clean();
      popup.close();
      reject(new Error("Sign-in timed out. Please try again."));
    }, 300000);
    popup.location.href = `${API_URL}/auth/start?challenge=${encodeURIComponent(challenge)}`;
  });
}
export async function logout() {
  const token = sessionToken;
  sessionToken = "";
  sessionEpoch++;
  try {
    if (token)
      await fetch(`${API_URL}/auth/logout`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(10000),
      });
  } finally {
    sessionToken = "";
  }
}
export async function saveShared(request: ChangeRequest): Promise<GuildView> {
  if (!sessionToken) throw new Error("Sign in before saving to the guild.");
  return api("/api/change", request);
}
export const requestMembership = () => api("/api/join", {});
export const saveMember = (member: Member, expectedRevision: number) =>
  api("/api/members", { member, expectedRevision, id: crypto.randomUUID() });
