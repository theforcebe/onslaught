import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import type { ReactNode, KeyboardEvent } from "react";
import { createPortal } from "react-dom";
import { Check, ChevronDown } from "lucide-react";

export type DropdownOption = {
  value: string;
  label: string;
  icon?: ReactNode;
  detail?: string;
};

/** A select-only combobox. Focus stays on its trigger while navigating options. */
export function Dropdown({
  label,
  value,
  onChange,
  options,
  icon,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: DropdownOption[];
  icon?: ReactNode;
}) {
  const id = useId();
  const trigger = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const search = useRef({ text: "", at: 0 });
  const [open, setOpen] = useState(false);
  const selectedIndex = Math.max(
    0,
    options.findIndex((o) => o.value === value),
  );
  const [active, setActive] = useState(selectedIndex);
  const [position, setPosition] = useState({
    top: 0,
    left: 0,
    width: 260,
    maxHeight: 320,
  });
  const selected = options[selectedIndex];
  const show = () => {
    setActive(selectedIndex);
    setOpen(true);
  };
  const choose = (index: number) => {
    if (options[index]) onChange(options[index].value);
    setOpen(false);
    trigger.current?.focus();
  };
  useLayoutEffect(() => {
    if (!open || !trigger.current) return;
    const rect = trigger.current.getBoundingClientRect();
    const below = window.innerHeight - rect.bottom - 16;
    const maxHeight = Math.min(320, Math.max(below, rect.top - 16));
    const width = Math.min(Math.max(rect.width, 248), window.innerWidth - 24);
    const height = Math.min(menu.current?.scrollHeight || 320, maxHeight);
    setPosition({
      top:
        below >= height ? rect.bottom + 7 : Math.max(8, rect.top - height - 7),
      left: Math.max(12, Math.min(rect.left, window.innerWidth - width - 12)),
      width,
      maxHeight,
    });
  }, [open]);
  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => {
      if (
        !trigger.current?.contains(event.target as Node) &&
        !menu.current?.contains(event.target as Node)
      )
        setOpen(false);
    };
    const reposition = (event: Event) => {
      if (menu.current?.contains(event.target as Node)) return;
      setOpen(false);
    };
    document.addEventListener("pointerdown", outside);
    window.addEventListener("resize", reposition);
    window.addEventListener("scroll", reposition, true);
    return () => {
      document.removeEventListener("pointerdown", outside);
      window.removeEventListener("resize", reposition);
      window.removeEventListener("scroll", reposition, true);
    };
  }, [open]);
  useEffect(() => {
    if (open)
      menu.current
        ?.querySelector(`[data-index="${active}"]`)
        ?.scrollIntoView({ block: "nearest" });
  }, [active, open]);
  const keyboard = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.key === "Tab") {
      setOpen(false);
      return;
    }
    if (event.key === "Escape") {
      if (open) event.preventDefault();
      setOpen(false);
      return;
    }
    if (["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) {
      event.preventDefault();
      if (!open) {
        show();
        return;
      }
      setActive((index) =>
        event.key === "Home"
          ? 0
          : event.key === "End"
            ? options.length - 1
            : (index + (event.key === "ArrowDown" ? 1 : -1) + options.length) %
              options.length,
      );
      return;
    }
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      if (open) choose(active);
      else show();
      return;
    }
    if (
      event.key.length === 1 &&
      !event.ctrlKey &&
      !event.metaKey &&
      !event.altKey
    ) {
      const now = Date.now();
      search.current = {
        text:
          (now - search.current.at < 700 ? search.current.text : "") +
          event.key.toLowerCase(),
        at: now,
      };
      const index = options.findIndex((option) =>
        option.label.toLowerCase().startsWith(search.current.text),
      );
      if (index >= 0) {
        event.preventDefault();
        setOpen(true);
        setActive(index);
      }
    }
  };
  return (
    <div className="dropdown">
      <button
        type="button"
        className="dropdown-trigger"
        ref={trigger}
        role="combobox"
        aria-label={label}
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-controls={open ? id : undefined}
        aria-activedescendant={open ? `${id}-${active}` : undefined}
        onClick={() => (open ? setOpen(false) : show())}
        onKeyDown={keyboard}
        onBlur={(event) => {
          if (!menu.current?.contains(event.relatedTarget as Node))
            setOpen(false);
        }}
      >
        {(selected?.icon || icon) && (
          <span className="dropdown-icon">{selected?.icon || icon}</span>
        )}
        <span>{selected?.label || label}</span>
        <ChevronDown size={14} className="dropdown-chevron" />
      </button>
      {open &&
        createPortal(
          <div
            ref={menu}
            id={id}
            role="listbox"
            aria-label={label}
            className="dropdown-menu"
            style={position}
          >
            {options.map((option, index) => (
              <div
                role="option"
                id={`${id}-${index}`}
                data-index={index}
                aria-selected={option.value === value}
                key={option.value}
                className={`dropdown-option ${active === index ? "is-active" : ""}`}
                onPointerMove={() => setActive(index)}
                onPointerDown={(event) => event.preventDefault()}
                onClick={() => choose(index)}
              >
                {option.icon && (
                  <span className="dropdown-icon">{option.icon}</span>
                )}
                <span className="dropdown-option-label">
                  <span>{option.label}</span>
                  {option.detail && <small>{option.detail}</small>}
                </span>
                {option.value === value && (
                  <Check size={14} className="dropdown-selected" />
                )}
              </div>
            ))}
          </div>,
          document.body,
        )}
    </div>
  );
}
