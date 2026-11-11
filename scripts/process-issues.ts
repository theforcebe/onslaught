import { readFileSync, appendFileSync } from "node:fs";
import { applyChange, ChangeError } from "../src/lib/reducer";
import { RequestSchema, StateSchema } from "../src/lib/model";
import { ZodError } from "zod";
const repo = process.env.GITHUB_REPOSITORY!,
  token = process.env.GITHUB_TOKEN!;
if (!repo || !token) throw new Error("GitHub runtime configuration missing");
const base = `https://api.github.com/repos/${repo}`;
async function api(path: string, method = "GET", body?: unknown) {
  const r = await fetch(base + path, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "onslaught-validator",
      "Content-Type": "application/json",
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!r.ok) throw new Error(`GitHub request failed with status ${r.status}`);
  return r.status === 204 ? null : r.json();
}
// Read open requests on every run: GitHub concurrency can coalesce pending runs.
// Draining the queue ensures a burst of submissions is never silently dropped.
let issues: any[] = [];
for (let page = 1; page <= 10; page++) {
  const batch = await api(
    `/issues?state=open&sort=created&direction=asc&per_page=100&page=${page}`,
  );
  issues.push(...batch);
  if (batch.length < 100) break;
}
let changed = false;
for (const issue of issues.filter(
  (i) => !i.pull_request && i.title.startsWith("[raid-change] "),
)) {
  try {
    if (
      !issue.user?.login ||
      typeof issue.body !== "string" ||
      issue.body.length > 150000
    )
      throw new ChangeError("Invalid request body.");
    const blocks = [...issue.body.matchAll(/```json\s*\n([\s\S]*?)\n```/g)];
    if (blocks.length !== 1)
      throw new ChangeError(
        "Include exactly one JSON request block copied from the app.",
      );
    const request = RequestSchema.parse(JSON.parse(blocks[0][1]));
    const file = await api("/contents/public/data/raid-state.json?ref=main");
    const current = StateSchema.parse(
      JSON.parse(Buffer.from(file.content, "base64").toString("utf8")),
    );
    // Actor comes exclusively from GitHub, never from the submitted JSON.
    const next = applyChange(current, request, {
      provider: "github",
      id: issue.user.login,
      label: issue.user.login,
    });
    if (next.revision !== current.revision) {
      await api("/contents/public/data/raid-state.json", "PUT", {
        branch: "main",
        sha: file.sha,
        message: `raid: ${request.action.type} via #${issue.number}`,
        content: Buffer.from(JSON.stringify(next, null, 2) + "\n").toString(
          "base64",
        ),
      });
      changed = true;
    }
    await api(`/issues/${issue.number}/comments`, "POST", {
      body: `Accepted and saved at guild revision ${next.revision}. The app reads the latest repository snapshot; refresh to see it.`,
    });
    await api(`/issues/${issue.number}`, "PATCH", {
      state: "closed",
      state_reason: "completed",
    });
  } catch (e) {
    // Errors never include submitted bodies, exports, tokens, or raw validation values.
    const message =
      e instanceof ChangeError
        ? e.message
        : e instanceof ZodError
          ? "Invalid request fields. Reopen the app and prepare the change again."
          : e instanceof SyntaxError
            ? "The JSON request could not be read. Copy the entire request from the app."
            : undefined;
    if (message) {
      await api(`/issues/${issue.number}/comments`, "POST", {
        body: `Change not applied: ${message} No guild data was modified by this request.`,
      });
      await api(`/issues/${issue.number}`, "PATCH", {
        state: "closed",
        state_reason: "not_planned",
      });
    } else {
      console.error(
        `Request #${issue.number} could not be processed. It remains open for a retry.`,
      );
      process.exitCode = 1;
    }
  }
}
if (process.env.GITHUB_OUTPUT)
  appendFileSync(process.env.GITHUB_OUTPUT, `changed=${changed}\n`);
console.log(`Request processing completed. Guild changed: ${changed}.`);
