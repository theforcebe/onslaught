import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { createPortal } from "react-dom";
import { ExternalLink, LoaderCircle, Package, X } from "lucide-react";
import { getItem, itemLink, safeIcon } from "./lib/items";
import { itemKey, itemParams } from "./lib/item-data";
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
    returningFocus = useRef(false),
    closeTimer = useRef<ReturnType<typeof setTimeout>>(undefined),
    key = itemKey(id, modifiers),
    tooltipId = useId();
  const clearClose = () => clearTimeout(closeTimer.current);
  const hide = (restoreFocus = false) => {
    clearClose();
    if (restoreFocus) returningFocus.current = true;
    setOpen(false);
    setPinned(false);
  };
  useLayoutEffect(() => {
    if (!open && returningFocus.current) {
      trigger.current?.focus({ preventScroll: true });
      returningFocus.current = false;
    }
  }, [open]);
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
    const visual = window.visualViewport;
    const position = () => {
      const t = trigger.current?.getBoundingClientRect(),
        p = panel.current;
      if (!t || !p) return;
      const viewport = visual?.width ?? document.documentElement.clientWidth;
      const x = visual?.offsetLeft ?? 0;
      const y = visual?.offsetTop ?? 0;
      const bottom = y + (visual?.height ?? window.innerHeight) - 12;
      const width = Math.min(365, viewport - 24);
      p.style.width = `${width}px`;
      const below = bottom - t.bottom - 6;
      const above = t.top - 6 - (y + 12);
      const placeAbove = p.scrollHeight + 2 > below && above > below;
      p.style.maxHeight = `${Math.max(44, Math.min(bottom - y - 12, placeAbove ? above : below))}px`;
      const height = p.getBoundingClientRect().height;
      const top = placeAbove ? t.top - height - 6 : t.bottom + 6;
      p.style.left = `${Math.max(x + 12, Math.min(t.left, x + viewport - width - 12))}px`;
      p.style.top = `${Math.max(y + 12, Math.min(top, bottom - height))}px`;
    };
    panel.current?.showPopover?.();
    position();
    const observer = new ResizeObserver(position);
    if (panel.current) observer.observe(panel.current);
    const keydown = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.preventDefault();
      e.stopPropagation();
      hide(!!panel.current?.contains(document.activeElement));
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
    visual?.addEventListener("resize", position);
    visual?.addEventListener("scroll", position);
    document.addEventListener("keydown", keydown, true);
    document.addEventListener("pointerdown", outside);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", position);
      window.removeEventListener("scroll", position, true);
      visual?.removeEventListener("resize", position);
      visual?.removeEventListener("scroll", position);
      document.removeEventListener("keydown", keydown, true);
      document.removeEventListener("pointerdown", outside);
    };
  }, [open]);
  useEffect(() => {
    if (pinned)
      panel.current?.querySelector("button")?.focus({ preventScroll: true });
  }, [pinned]);
  const item = result?.item,
    src = safeIcon(item?.icon_url),
    lines = item?.tooltipLines || [];
  const requested = itemParams(modifiers);
  const hasUnverifiedModifiers = Object.keys(modifiers).length > requested.size;
  return (
    <>
      <button
        ref={trigger}
        type="button"
        className={`item-trigger ${className} ${item?.quality || ""}`}
        aria-label={`Inspect ${name}`}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={open ? tooltipId : undefined}
        onMouseEnter={() => {
          clearClose();
          setOpen(true);
        }}
        onMouseLeave={() => {
          if (
            document.activeElement !== trigger.current &&
            !panel.current?.contains(document.activeElement)
          )
            leave();
        }}
        onFocus={(e) => {
          if (
            !returningFocus.current &&
            !panel.current?.contains(e.relatedTarget)
          )
            setOpen(true);
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
            onMouseLeave={() => {
              if (
                document.activeElement !== trigger.current &&
                !panel.current?.contains(document.activeElement)
              )
                leave();
            }}
            onFocus={clearClose}
            onBlur={(e) => {
              // WebKit focuses the containing native dialog before dispatching a tapped button's click.
              if (pinned && (!e.relatedTarget || e.relatedTarget === trigger.current?.closest("dialog[open]"))) return;
              if (
                !panel.current?.contains(e.relatedTarget) &&
                e.relatedTarget !== trigger.current
              )
                hide();
            }}
          >
            <header>
              <span className={`item-tooltip-name ${item?.quality || ""}`}>
                {src && <img src={src} alt="" referrerPolicy="no-referrer" />}
                {name}
              </span>
              <button
                className="icon-btn"
                aria-label="Close item details"
                type="button"
                onClick={() => hide(true)}
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
                  ? "Wowhead Forever has no details for this item ID."
                  : "Item lookup is temporarily unavailable."}
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
            {hasUnverifiedModifiers && (
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
          trigger.current?.closest("dialog[open]") ?? document.body,
        )}
    </>
  );
}
