import { useEffect, useRef, useState } from "react";
import type { CSSProperties, ReactNode, FormEvent } from "react";
import { X, Shield, Heart, Swords, Crosshair, HelpCircle } from "lucide-react";
import { CLASS_COLORS, label } from "./lib/model";
import type { Character, Gear } from "./lib/model";
import { ItemTooltip } from "./ItemTooltip";

export function ClassIcon({
  cls,
  size = 36,
}: {
  cls: Character["class"];
  size?: number;
}) {
  return (
    <span
      className="class-icon"
      style={
        {
          "--class-color": CLASS_COLORS[cls],
          width: size,
          height: size,
        } as CSSProperties
      }
    >
      <img
        src={`https://render.worldofwarcraft.com/us/icons/56/classicon_${cls}.jpg`}
        alt={`${label(cls)} class`}
        loading="lazy"
        onError={(e) => {
          e.currentTarget.style.display = "none";
        }}
      />
      <span aria-hidden="true">{cls[0].toUpperCase()}</span>
    </span>
  );
}
export function RoleIcon({ role, size = 15 }: { role: string; size?: number }) {
  const Icon =
    role === "tank"
      ? Shield
      : role === "healer"
        ? Heart
        : role === "melee"
          ? Swords
          : role === "ranged"
            ? Crosshair
            : HelpCircle;
  return <Icon size={size} />;
}
export function Player({
  character,
  detail,
  onClick,
}: {
  character: Character;
  detail?: string;
  onClick?: () => void;
}) {
  const content = (
    <>
      <ClassIcon cls={character.class} />
      <span className="player-text">
        <strong style={{ color: CLASS_COLORS[character.class] }}>
          {character.name}
        </strong>
        <small>
          {detail ||
            `${character.spec || "Choose spec"} · ${label(character.class)}`}
        </small>
      </span>
      <span
        className={`role-icon ${character.role}`}
        title={label(character.role)}
      >
        <RoleIcon role={character.role} />
      </span>
    </>
  );
  return onClick ? (
    <button className="player" onClick={onClick}>
      {content}
    </button>
  ) : (
    <div className="player">{content}</div>
  );
}
export function Modal({
  title,
  children,
  onClose,
  wide = false,
  className = "",
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
  wide?: boolean;
  className?: string;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    ref.current?.showModal();
    return () => ref.current?.close();
  }, []);
  return (
    <dialog
      ref={ref}
      className={`${wide ? "modal wide" : "modal"} ${className}`}
      aria-label={title}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="modal-head">
        <h2>{title}</h2>
        <button
          className="icon-btn"
          aria-label="Close dialog"
          onClick={onClose}
        >
          <X size={20} />
        </button>
      </div>
      <div className="modal-body">{children}</div>
    </dialog>
  );
}
export function Empty({
  icon,
  title,
  children,
  action,
}: {
  icon: ReactNode;
  title: string;
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="empty">
      <span className="empty-icon">{icon}</span>
      <h3>{title}</h3>
      <p>{children}</p>
      {action}
    </div>
  );
}
export function Field({
  label: caption,
  children,
  hint,
}: {
  label: string;
  children: ReactNode;
  hint?: string;
}) {
  return (
    <label className="field">
      <span>{caption}</span>
      {children}
      {hint && <small>{hint}</small>}
    </label>
  );
}
export function Form({
  children,
  onSubmit,
}: {
  children: ReactNode;
  onSubmit: (data: FormData) => void;
}) {
  return (
    <form
      onSubmit={(e: FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        onSubmit(new FormData(e.currentTarget));
      }}
    >
      {children}
    </form>
  );
}
export function Meter({
  value,
  max = 100,
  color,
}: {
  value: number;
  max?: number;
  color?: string;
}) {
  return (
    <div
      className="meter"
      role="progressbar"
      aria-valuenow={value}
      aria-valuemin={0}
      aria-valuemax={Math.max(max, value)}
    >
      <span
        style={{
          width: `${Math.min(100, max ? (value / max) * 100 : 0)}%`,
          background: color,
        }}
      />
    </div>
  );
}
export function GearItem({ gear }: { gear: Gear }) {
  return (
    <div className="gear-item">
      <ItemTooltip
        id={gear.id}
        name={gear.name}
        modifiers={gear.modifiers}
        className="gear-main"
        icon
      >
        <span>
          <small>{label(gear.slot)}</small>
          <strong>{gear.name}</strong>
          <small>
            #{gear.id}
            {gear.modifiers.enchant_id && " · Enchanted"}
            {gear.modifiers.bonus_id && " · Variant"}
          </small>
        </span>
        <span className="item-level">{gear.level || "—"}</span>
      </ItemTooltip>
    </div>
  );
}
