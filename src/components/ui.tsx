import { useEffect, useRef } from "react";
import type { ButtonHTMLAttributes, ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import {
  ArrowDownLeft,
  ArrowUpRight,
  ChevronLeft,
  ChevronRight,
  Search,
  X,
} from "lucide-react";
import { monthLabel, number } from "../lib/format";
import type { FleetSnapshot, Period } from "../domain/models";

export function Button({
  children,
  icon: Icon,
  variant = "primary",
  className = "",
  type = "button",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  icon?: LucideIcon;
  variant?: "primary" | "secondary" | "ghost" | "danger";
}) {
  return (
    <button type={type} className={`button ${variant} ${className}`} {...props}>
      {Icon && <Icon size={16} aria-hidden="true" />}
      {children}
    </button>
  );
}
export function Badge({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?: "green" | "amber" | "red" | "neutral" | "blue";
}) {
  return (
    <span className={`badge ${tone}`}>
      <span className="status-dot" />
      {children}
    </span>
  );
}
export function PageHeading({
  eyebrow,
  title,
  description,
  children,
}: {
  eyebrow?: string;
  title: string;
  description: string;
  children?: ReactNode;
}) {
  return (
    <div className="page-heading">
      <div>
        {eyebrow && <div className="eyebrow">{eyebrow}</div>}
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
      <div className="heading-actions">{children}</div>
    </div>
  );
}
export function Metric({
  label,
  value,
  subtitle,
  icon: Icon,
  highlight,
  change,
}: {
  label: string;
  value: string;
  subtitle: string;
  icon: LucideIcon;
  highlight?: boolean;
  change?: { value: number; label: string };
}) {
  return (
    <div className={`metric ${highlight ? "highlight" : ""}`}>
      <div className="metric-top">
        <span>{label}</span>
        <span className="metric-icon">
          <Icon size={18} aria-hidden="true" />
        </span>
      </div>
      <strong>{value}</strong>
      <div className="metric-bottom">
        {change && (
          <span
            className={`change ${change.value >= 0 ? "positive" : "negative"}`}
          >
            {change.value >= 0 ? (
              <ArrowUpRight size={13} />
            ) : (
              <ArrowDownLeft size={13} />
            )}
            {Math.abs(change.value).toFixed(1).replace(".", ",")} %
          </span>
        )}
        <span>{change?.label ?? subtitle}</span>
      </div>
    </div>
  );
}
export function PeriodPicker({
  snapshot,
  value,
  onChange,
}: {
  snapshot: FleetSnapshot;
  value: Period;
  onChange(value: Period): void;
}) {
  const months = [
    ...new Set([
      snapshot.demoMonth,
      ...snapshot.entries.map((entry) => entry.date.slice(0, 7)),
    ]),
  ]
    .sort()
    .reverse();
  return (
    <label className="period-picker">
      <span>Periodo</span>
      <select
        aria-label="Periodo"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        {months.map((month) => (
          <option key={month} value={month}>
            {monthLabel(month)}
          </option>
        ))}
        <option value="all">Todo el historial</option>
      </select>
    </label>
  );
}
export function SearchField({
  value,
  onChange,
  placeholder = "Buscar…",
  label = "Buscar",
}: {
  value: string;
  onChange(value: string): void;
  placeholder?: string;
  label?: string;
}) {
  return (
    <div className="search-field">
      <Search size={17} aria-hidden="true" />
      <input
        aria-label={label}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
      />
      {value && (
        <button aria-label="Limpiar búsqueda" onClick={() => onChange("")}>
          <X size={14} />
        </button>
      )}
    </div>
  );
}
export function Empty({
  title = "No hay resultados",
  children,
}: {
  title?: string;
  children?: ReactNode;
}) {
  return (
    <div className="empty-state">
      <Search size={28} aria-hidden="true" />
      <h3>{title}</h3>
      <p>{children ?? "Prueba con otros filtros o añade un nuevo registro."}</p>
    </div>
  );
}
export function Pagination({
  total,
  page,
  pageSize,
  onChange,
}: {
  total: number;
  page: number;
  pageSize: number;
  onChange(page: number): void;
}) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const actual = Math.min(page, pages);
  return (
    <div className="pagination">
      <span>
        {total
          ? `${number((actual - 1) * pageSize + 1)}–${number(Math.min(actual * pageSize, total))} de ${number(total)}`
          : "0 registros"}
      </span>
      <div>
        <button
          className="icon-button"
          aria-label="Página anterior"
          disabled={actual === 1}
          onClick={() => onChange(actual - 1)}
        >
          <ChevronLeft size={16} />
        </button>
        <span>
          Página {actual} de {pages}
        </span>
        <button
          className="icon-button"
          aria-label="Página siguiente"
          disabled={actual === pages}
          onClick={() => onChange(actual + 1)}
        >
          <ChevronRight size={16} />
        </button>
      </div>
    </div>
  );
}
export function Modal({
  title,
  subtitle,
  children,
  onClose,
  wide = false,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
  onClose(): void;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    dialog?.showModal();
    return () => dialog?.close();
  }, []);
  return (
    <dialog
      ref={ref}
      className={`modal ${wide ? "wide" : ""}`}
      aria-labelledby="modal-title"
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="modal-content">
        <div className="modal-heading">
          <div>
            <h2 id="modal-title">{title}</h2>
            {subtitle && <p>{subtitle}</p>}
          </div>
          <button
            className="icon-button"
            aria-label="Cerrar ventana"
            onClick={onClose}
          >
            <X size={20} />
          </button>
        </div>
        {children}
      </div>
    </dialog>
  );
}
