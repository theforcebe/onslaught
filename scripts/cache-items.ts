import { readFileSync, writeFileSync } from "node:fs";
import { StateSchema } from "../src/lib/model";
import { EXAMPLE_EXPORT } from "../src/lib/example";
import { parseSimc } from "../src/lib/parser";
const s = StateSchema.parse(
  JSON.parse(readFileSync("public/data/raid-state.json", "utf8")),
);
const snapshots = s.characters.flatMap((c) => (c.snapshot ? [c.snapshot] : []));
if (!snapshots.length) snapshots.push(parseSimc(EXAMPLE_EXPORT));
const ids = [
  ...new Set(
    snapshots.flatMap((c) =>
      [...c.gear, ...c.bagGear, ...c.bags].map((g) => g.id),
    ),
  ),
];
const items: Record<string, unknown> = {};
for (const id of ids) {
  const checkedAt = Date.now();
  const r = await fetch(`https://thewowdb.com/api/v1/forever/item/${id}`, {
    signal: AbortSignal.timeout(15000),
  });
  if (r.status === 429)
    throw new Error(
      "Provider rate limit reached. Cache not replaced. Retry later.",
    );
  if (r.ok) items[id] = { status: "resolved", checkedAt, item: await r.json() };
  else
    items[id] = {
      status: r.status === 404 ? "unresolved" : "unavailable",
      checkedAt,
    };
  console.log(`Item ${id}: ${r.status}`);
  await new Promise((r) => setTimeout(r, 560));
}
writeFileSync(
  "public/data/items.json",
  JSON.stringify(
    {
      provider: "TheWoWDB",
      attribution: "https://thewowdb.com/developers/",
      items,
    },
    null,
    2,
  ) + "\n",
);
