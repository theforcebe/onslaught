type SavedSession = { token: string; expiresAt: number };
const KEY = "onslaught:session:v1";
const MAX_AGE = 3600000;

/** Only the short-lived guild session is retained. Never store provider credentials. */
export function createSessionStore(
  storage?: Pick<Storage, "getItem" | "setItem" | "removeItem">,
) {
  let saved: SavedSession | undefined;
  const clear = () => {
    saved = undefined;
    try {
      storage?.removeItem(KEY);
    } catch {
      /* Storage may be disabled. */
    }
  };
  try {
    const raw = storage?.getItem(KEY);
    if (raw) {
      const value = JSON.parse(raw);
      if (
        !value ||
        typeof value.token !== "string" ||
        !/^[A-Za-z0-9_-]{43}$/.test(value.token) ||
        !Number.isFinite(value.expiresAt) ||
        value.expiresAt <= Date.now() ||
        value.expiresAt > Date.now() + MAX_AGE
      )
        clear();
      else saved = { token: value.token, expiresAt: value.expiresAt };
    }
  } catch {
    clear();
  }
  return {
    token() {
      if (saved && saved.expiresAt <= Date.now()) clear();
      return saved?.token || "";
    },
    save(token: unknown, expiresIn: unknown) {
      if (
        typeof token !== "string" ||
        !/^[A-Za-z0-9_-]{43}$/.test(token) ||
        typeof expiresIn !== "number" ||
        !Number.isFinite(expiresIn) ||
        expiresIn <= 0 ||
        expiresIn > 3600
      )
        throw new Error("The sign-in response was invalid. Please try again.");
      saved = { token, expiresAt: Date.now() + expiresIn * 1000 };
      try {
        storage?.setItem(KEY, JSON.stringify(saved));
      } catch {
        /* Continue in memory if tab storage is unavailable. */
      }
    },
    clear,
  };
}

export function tabStorage(): Storage | undefined {
  try {
    return window.sessionStorage;
  } catch {
    return undefined;
  }
}
