import { useEffect, useId, useState } from "react";
import { Search, X } from "lucide-react";
import { API_URL } from "./lib/api";
import { ItemTooltip } from "./ItemTooltip";
export type ItemSuggestion = {
  id: number;
  name: string;
  icon: string;
  quality: number;
  category: string;
};
const cache = new Map<string, { at: number; results: ItemSuggestion[] }>();
export function ItemPicker({
  value,
  onChange,
}: {
  value?: ItemSuggestion;
  onChange: (item: ItemSuggestion | undefined) => void;
}) {
  const [query, setQuery] = useState(""),
    [results, setResults] = useState<ItemSuggestion[]>([]),
    [loading, setLoading] = useState(false),
    [error, setError] = useState(""),
    [active, setActive] = useState(0);
  const id = useId();
  useEffect(() => {
    const q = query.trim().replace(/\s+/g, " ").toLowerCase();
    setResults([]);
    setActive(0);
    setError("");
    if (q.length < 2 || value) {
      setLoading(false);
      return;
    }
    const old = cache.get(q);
    if (old && Date.now() - old.at < 43200000) {
      setResults(old.results);
      return;
    }
    const abort = new AbortController();
    setLoading(true);
    const timer = setTimeout(async () => {
      try {
        const r = await fetch(
          `${API_URL}/api/items/search?q=${encodeURIComponent(q)}`,
          { signal: abort.signal },
        );
        if (!r.ok) throw new Error("Search is busy. Try again shortly.");
        const data = await r.json();
        if (!data.available)
          throw new Error(
            "Wowhead search is temporarily unavailable. You can enter the item name below.",
          );
        if (!abort.signal.aborted) {
          cache.set(q, { at: Date.now(), results: data.results });
          if (cache.size > 100) cache.delete(cache.keys().next().value!);
          setResults(data.results);
        }
      } catch (e) {
        if (!abort.signal.aborted) setError((e as Error).message);
      } finally {
        if (!abort.signal.aborted) setLoading(false);
      }
    }, 350);
    return () => {
      clearTimeout(timer);
      abort.abort();
    };
  }, [query, value]);
  return (
    <div className="item-picker">
      {value ? (
        <div className="item-selected">
          <ItemTooltip id={value.id} name={value.name} icon />
          <span className="muted">#{value.id}</span>
          <button
            type="button"
            className="icon-btn"
            aria-label="Change selected item"
            onClick={() => onChange(undefined)}
          >
            <X size={16} />
          </button>
        </div>
      ) : (
        <>
          <label className="search item-search">
            <Search size={17} />
            <input
              aria-label="Search Wowhead Forever items"
              role="combobox"
              aria-expanded={!!results.length}
              aria-controls={id}
              aria-autocomplete="list"
              aria-activedescendant={
                results.length ? `${id}-${active}` : undefined
              }
              value={query}
              maxLength={64}
              placeholder="Search materials, food, flasks…"
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "ArrowDown" || e.key === "ArrowUp") {
                  e.preventDefault();
                  setActive(
                    (i) =>
                      (i + (e.key === "ArrowDown" ? 1 : -1) + results.length) %
                      Math.max(1, results.length),
                  );
                }
                if (e.key === "Enter" && results[active]) {
                  e.preventDefault();
                  onChange(results[active]);
                }
                if (e.key === "Escape") {
                  setResults([]);
                }
              }}
            />
          </label>
          <div role="status" className="muted">
            {loading
              ? "Searching Forever…"
              : error ||
                (query.length >= 2 && !results.length
                  ? "No matching suggestions. Refine the name or enter it manually."
                  : "Search by name, then choose the exact item. Hover the preview to inspect it.")}
          </div>
          {!!results.length && (
            <div
              id={id}
              role="listbox"
              aria-label="Forever item suggestions"
              className="item-results"
            >
              {results.map((r, i) => (
                <div
                  key={r.id}
                  className={`item-result ${active === i ? "active" : ""}`}
                >
                  <button
                    id={`${id}-${i}`}
                    type="button"
                    role="option"
                    aria-selected={active === i}
                    onClick={() => onChange(r)}
                  >
                    <img
                      src={`https://wow.zamimg.com/images/wow/icons/medium/${r.icon}.jpg`}
                      alt=""
                      loading="lazy"
                    />
                    <span>
                      <strong>{r.name}</strong>
                      <small>
                        {r.category} · #{r.id}
                      </small>
                    </span>
                  </button>
                  <ItemTooltip id={r.id} name={r.name}>
                    Preview
                  </ItemTooltip>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
