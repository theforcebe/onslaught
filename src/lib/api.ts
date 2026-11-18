import { StateSchema } from "./model";
import type { ChangeRequest } from "./model";
import { ViewSchema, PUBLIC_ACCESS } from "./access";
import type { GuildView, Member } from "./access";
import { guildSession as session } from "./session";
import { startBattleNetRedirect } from "./battlenet";
export const REPOSITORY = "theforcebe/onslaught";
export const REPO_URL = `https://github.com/${REPOSITORY}`;
export const API_URL = (import.meta.env.VITE_API_URL || "").replace(/\/$/, "");
let sessionEpoch = 0;
export const sessionActive = () => !!session.token();
async function api(path: string, body?: unknown): Promise<GuildView> {
  const epoch = sessionEpoch;
  const sessionToken = session.token();
  const r = await fetch(`${API_URL}${path}`, {
    method: body === undefined ? "GET" : "POST",
    headers: {
      Accept: "application/vnd.onslaught.guild-v2+json",
      ...(sessionToken ? { Authorization: `Bearer ${sessionToken}` } : {}),
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    cache: "no-store",
    signal: AbortSignal.timeout(15000),
  });
  if (epoch !== sessionEpoch)
    throw new Error("Session changed. Refresh the guild view.");
  if (r.status === 401) {
    session.clear();
    sessionEpoch++;
    throw new Error("Your session expired. Sign in to reconnect.");
  }
  const data = await r.json();
  if (epoch !== sessionEpoch)
    throw new Error("Session changed. Refresh the guild view.");
  if (!r.ok) throw new Error(data.error || "The guild could not be loaded.");
  return ViewSchema.parse(data);
}
export async function loadGuild(): Promise<GuildView & { isCurrent: boolean }> {
  if (API_URL) {
    const restoring = sessionActive();
    try {
      return {
        ...(await api(restoring ? "/api/state" : "/api/public")),
        isCurrent: true,
      };
    } catch (error) {
      // A revoked/expired stored session returns to the public view without trapping the page.
      if (restoring && !sessionActive())
        return { ...(await api("/api/public")), isCurrent: true };
      throw error;
    }
  }
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
export function loginBattleNet() {
  return startBattleNetRedirect(API_URL);
}
export async function logout() {
  const token = session.token();
  session.clear();
  sessionEpoch++;
  try {
    if (token)
      await fetch(`${API_URL}/auth/logout`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(10000),
      });
  } catch {
    /* Local sign-out has already cleared the session. */
  }
}
export async function saveShared(request: ChangeRequest): Promise<GuildView> {
  if (!sessionActive()) throw new Error("Sign in before saving to the guild.");
  return api("/api/change", request);
}
export const requestMembership = () => api("/api/join", {});
export const saveMember = (member: Member, expectedRevision: number) =>
  api("/api/members", { member, expectedRevision, id: crypto.randomUUID() });

export class ChatError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}
export async function chatCall<T>(path: string, body?: unknown): Promise<T> {
  const epoch = sessionEpoch,
    token = session.token();
  if (!token) throw new ChatError("Sign in to use guild chat.", 401);
  const r = await fetch(`${API_URL}/api/chat/${path}`, {
    method: body === undefined ? "GET" : "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    cache: "no-store",
    signal: AbortSignal.timeout(15000),
  });
  const data = await r.json();
  if (epoch !== sessionEpoch) throw new ChatError("Your session changed.", 401);
  if (r.status === 401) {
    session.clear();
    sessionEpoch++;
  }
  if (!r.ok)
    throw new ChatError(
      data.error || "Chat could not connect. Try again.",
      r.status,
    );
  return data;
}

export async function discordCall(path: string, body?: unknown) {
  const epoch = sessionEpoch,
    token = session.token();
  if (!token) throw new Error("Sign in before connecting Discord.");
  const r = await fetch(`${API_URL}/api/discord/${path}`, {
    method: body === undefined ? "GET" : "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    cache: "no-store",
    signal: AbortSignal.timeout(25000),
  });
  const data = await r.json();
  if (epoch !== sessionEpoch)
    throw new Error("Your session changed. Refresh the guild view.");
  if (r.status === 401) {
    session.clear();
    sessionEpoch++;
  }
  if (!r.ok)
    throw new Error(
      data.error || "The Discord request could not be completed.",
    );
  return data;
}
