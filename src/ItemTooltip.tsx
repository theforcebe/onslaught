import { useEffect, useId, useRef, useState } from "react";
import type { ReactNode } from "react";
import { createPortal } from "react-dom";
import { ExternalLink, LoaderCircle, Package, X } from "lucide-react";
import { getItem, itemLink, safeIcon } from "./lib/items";
import { itemKey } from "./lib/item-data";
import type { ItemModifiers, ItemResult } from "./lib/item-data";

type Props = {
  id: number;
  name: string;
  modifiers?: ItemModifiers;
  children?: ReactNode;
  className?: string;
  icon?: boolean;
};
export function ItemTooltip({
  id,
  name,
  modifiers = {},
  children,
  className = "",
  icon = false,
}: Props) {
  const [open, setOpen] = useState(false),
    [pinned, setPinned] = useState(false),
    [result, setResult] = useState<ItemResult>(),
    [loading, setLoading] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null),
    panel = useRef<HTMLDivElement>(null),
    closeTimer = useRef<ReturnType<typeof setTimeout>>(undefined),
    key = itemKey(id, modifiers),
    tooltipId = useId();
  const clearClose = () => clearTimeout(closeTimer.current);
  const hide = () => {
    clearClose();
    setOpen(false);
    setPinned(false);
  };
  const leave = () => {
    clearClose();
    if (!pinned) closeTimer.current = setTimeout(() => setOpen(false), 180);
  };
  useEffect(() => {
    setResult(undefined);
    setOpen(false);
    setPinned(false);
  }, [key]);
  useEffect(() => () => clearClose(), []);
  useEffect(() => {
    if (!open) return;
    let live = true;
    setLoading(true);
    void getItem(id, modifiers)
      .then((r) => {
        if (live) setResult(r);
      })
      .catch(() => {
        if (live) setResult({ status: "unavailable", checkedAt: Date.now() });
      })
      .finally(() => {
        if (live) setLoading(false);
      });
    return () => {
      live = false;
    };
  }, [open, key]);
  useEffect(() => {
    if (!open) return;
    const position = () => {
      const t = trigger.current?.getBoundingClientRect(),
        p = panel.current;
      if (!t || !p) return;
      const viewport = document.documentElement.clientWidth;
      const width = Math.min(365, viewport - 24);
      p.style.width = `${width}px`;
      const height = Math.min(p.scrollHeight, window.innerHeight - 32);
      p.style.left = `${Math.max(12, Math.min(t.left, viewport - width - 12))}px`;
      p.style.top = `${Math.max(12, Math.min(t.bottom + 8, window.innerHeight - height - 12))}px`;
    };
    panel.current?.showPopover?.();
    position();
    const observer = new ResizeObserver(position);
    if (panel.current) observer.observe(panel.current);
    const keydown = (e: KeyboardEvent) => {
      if (e.key === "Escape") hide();
    };
    const outside = (e: PointerEvent) => {
      if (
        !panel.current?.contains(e.target as Node) &&
        !trigger.current?.contains(e.target as Node)
      )
        hide();
    };
    window.addEventListener("resize", position);
    window.addEventListener("scroll", position, true);
    document.addEventListener("keydown", keydown);
    document.addEventListener("pointerdown", outside);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", position);
      window.removeEventListener("scroll", position, true);
      document.removeEventListener("keydown", keydown);
      document.removeEventListener("pointerdown", outside);
    };
  }, [open, result]);
  const item = result?.item,
    src = safeIcon(item?.icon_url),
    lines = item?.tooltipLines || [];
  const unsupported = Object.keys(modifiers).filter(
    (k) => !["bonus_id", "enchant_id", "gem_id"].includes(k),
  );
  return (
    <>
      <button
        ref={trigger}
        type="button"
        className={`item-trigger ${className} ${item?.quality || ""}`}
        aria-label={`Inspect ${name}`}
        aria-expanded={open}
        aria-controls={open ? tooltipId : undefined}
        onMouseEnter={() => {
          clearClose();
          setOpen(true);
        }}
        onMouseLeave={leave}
        onFocus={(e) => {
          if (!panel.current?.contains(e.relatedTarget)) setOpen(true);
        }}
        onBlur={(e) => {
          if (!panel.current?.contains(e.relatedTarget)) leave();
        }}
        onClick={() => {
          clearClose();
          if (pinned) hide();
          else {
            setOpen(true);
            setPinned(true);
          }
        }}
      >
        {icon && (
          <span className="item-icon">
            {src ? (
              <img
                src={src}
                alt=""
                loading="lazy"
                referrerPolicy="no-referrer"
              />
            ) : (
              <Package size={20} />
            )}
          </span>
        )}
        {children || <span>{name}</span>}
      </button>
      {open &&
        createPortal(
          <div
            ref={panel}
            popover="manual"
            id={tooltipId}
            role="dialog"
            aria-label={`${name} item details`}
            className="item-tooltip"
            onMouseEnter={clearClose}
            onMouseLeave={leave}
          >
            <header>
              <span className={`item-tooltip-name ${item?.quality || ""}`}>
                {src && <img src={src} alt="" referrerPolicy="no-referrer" />}
                {name}
              </span>
              <button
                className="icon-btn"
                aria-label="Close item details"
                onClick={() => {
                  hide();
                  trigger.current?.focus();
                }}
              >
                <X size={16} />
              </button>
            </header>
            {loading && !item ? (
              <p className="muted">
                <LoaderCircle className="spin" size={16} /> Looking up Forever
                item…
              </p>
            ) : item ? (
              <div className="item-tooltip-lines">
                {lines.map((line, i) => (
                  <p
                    key={i}
                    className={
                      /^Equip:|^Use:|^Set:|^\(\d+\) Set:|^Stamina \+/.test(line)
                        ? "item-effect"
                        : ""
                    }
                  >
                    {line}
                  </p>
                ))}
              </div>
            ) : (
              <p className="muted">
                {result?.status === "unresolved"
                  ? "This item is not indexed yet."
                  : "Item lookup is temporarily unavailable."}{" "}
                Your imported details are preserved.
              </p>
            )}
            {!!Object.keys(modifiers).length && (
              <details className="item-modifiers">
                <summary>Imported item modifiers</summary>
                {Object.entries(modifiers).map(([k, v]) => (
                  <p key={k}>
                    {k.replaceAll("_", " ")}: {v}
                  </p>
                ))}
              </details>
            )}
            {!!unsupported.length && (
              <p className="item-caveat">
                Content tuning and other unverified modifiers may differ
                in-game. Imported values remain saved.
              </p>
            )}
            <footer>
              <a
                href={itemLink(id, modifiers)}
                target="_blank"
                rel="noreferrer"
              >
                Wowhead Forever <ExternalLink size={12} />
              </a>
              <small>
                {result?.stale
                  ? "Cached · refresh unavailable"
                  : item
                    ? "Cached up to 12 hours"
                    : `Item #${id}`}
              </small>
            </footer>
          </div>,
          document.body,
        )}
    </>
  );
}
