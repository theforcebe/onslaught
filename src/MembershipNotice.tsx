import { useState } from "react";
import { Clock3, ShieldCheck } from "lucide-react";
import type { Access } from "./lib/access";

export function MembershipNotice({
  status,
  join,
}: {
  status: Access["status"];
  join: () => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const pending = status === "pending";
  if (!pending && status !== "unregistered") return null;
  const Icon = pending ? Clock3 : ShieldCheck;
  return (
    <section className="membership-notice" aria-label="Guild membership">
      <Icon size={24} aria-hidden="true" />
      <div aria-live="polite">
        <h2>{pending ? "Membership request sent" : "Join Ønslaught"}</h2>
        <p>
          {pending
            ? "A guild admin will review your request. Your access updates here after approval."
            : "You’re signed in with Battle.net. Request membership so a guild admin can approve your account."}
        </p>
        {error && <p role="alert">{error}</p>}
      </div>
      {!pending && (
        <button
          className="btn primary"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            setError("");
            try {
              await join();
            } catch (e) {
              setError(
                e instanceof Error
                  ? e.message
                  : "Could not send the request. Try again.",
              );
            } finally {
              setBusy(false);
            }
          }}
        >
          {busy ? "Sending…" : "Request membership"}
        </button>
      )}
    </section>
  );
}
