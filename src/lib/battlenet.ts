import { guildSession, tabStorage } from "./session";

const pendingKey = "onslaught:bnet-pending:v1";
const lifetime = 10 * 60 * 1000;
const returnPrefix = "#bnet-return=";
const restart =
  "Open Ønslaught in Safari or Chrome and start sign-in again in that browser.";

export async function startBattleNetRedirect(gateway: string) {
  if (!gateway) throw new Error("Battle.net sign-in is unavailable.");
  const verifier = crypto.randomUUID() + crypto.randomUUID();
  const hash = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(verifier),
  );
  const challenge = btoa(String.fromCharCode(...new Uint8Array(hash)))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replaceAll("=", "");
  try {
    const storage = tabStorage();
    if (!storage) throw new Error();
    storage.setItem(
      pendingKey,
      JSON.stringify({
        verifier,
        expiresAt: Date.now() + lifetime,
        search: window.location.search,
        hash: window.location.hash,
      }),
    );
  } catch {
    throw new Error(
      "This browser could not save the sign-in request. " + restart,
    );
  }
  const url = new URL("/auth/start", gateway);
  url.search = new URLSearchParams({ challenge, flow: "redirect" }).toString();
  window.location.assign(url.href);
}

/** Runs before the router sees the fragment. The code is single-use and the verifier stays in this tab. */
export async function finishBattleNetRedirect(gateway: string) {
  if (!window.location.hash.startsWith(returnPrefix)) return;
  const code = window.location.hash.slice(returnPrefix.length);
  const url = new URL(window.location.href);
  url.hash = "";
  window.history.replaceState(null, "", url.href);
  const storage = tabStorage();
  let pending;
  try {
    pending = JSON.parse(storage?.getItem(pendingKey) || "null");
    storage?.removeItem(pendingKey);
  } catch {
    throw new Error(restart);
  }
  if (
    !pending ||
    typeof pending.verifier !== "string" ||
    !/^[a-f0-9-]{72}$/i.test(pending.verifier) ||
    !Number.isFinite(pending.expiresAt) ||
    pending.expiresAt <= Date.now()
  ) {
    throw new Error(
      "The original sign-in tab is missing or the request expired. " + restart,
    );
  }
  // Only restore query and hash on the fixed app URL, including raid signup links.
  url.search = typeof pending.search === "string" ? pending.search : "";
  url.hash = typeof pending.hash === "string" ? pending.hash : "";
  window.history.replaceState(null, "", url.href);
  if (!gateway || !/^[A-Za-z0-9_-]{43}$/.test(code)) {
    throw new Error("Battle.net sign-in was cancelled or expired. " + restart);
  }
  const response = await fetch(`${gateway}/auth/exchange`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ code, verifier: pending.verifier }),
    cache: "no-store",
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok)
    throw new Error("Your sign-in could not be completed. " + restart);
  const data = await response.json();
  guildSession.save(data.token, data.expiresIn);
}
