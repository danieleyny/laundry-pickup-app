// Shared UI kit — Tailwind + design tokens. Used by admin and customer pages.
// Driver app keeps its inline-style approach; these are usable there too but
// not required.

import { useEffect, useRef } from "react";

const cn = (...args) => args.filter(Boolean).join(" ");

// ── Button ──
export function Button({ variant = "primary", size = "md", className = "", disabled, children, ...rest }) {
  const base = "inline-flex items-center justify-center gap-2 font-bold tracking-wide rounded-xl transition active:translate-y-px disabled:opacity-50 disabled:cursor-not-allowed font-sans";
  const sizes = {
    sm: "px-3 py-2 text-xs",
    md: "px-5 py-3 text-sm",
    lg: "px-7 py-4 text-base",
  };
  const variants = {
    primary: "bg-brand text-white shadow-pill hover:bg-brand-deep",
    secondary: "bg-white text-ink border border-ldn-border hover:bg-surface-warm",
    ghost: "bg-transparent text-ink-soft hover:bg-surface-warm",
    danger: "bg-dropoff text-white hover:opacity-90",
    outline: "bg-transparent text-brand border border-brand hover:bg-brand-soft",
  };
  return (
    <button className={cn(base, sizes[size], variants[variant], className)} disabled={disabled} {...rest}>
      {children}
    </button>
  );
}

// ── Card ──
export function Card({ className = "", children, ...rest }) {
  return (
    <div
      className={cn(
        "bg-white rounded-2xl border border-ldn-border shadow-card overflow-hidden dark:bg-[var(--ldn-surface)] dark:border-[var(--ldn-border)]",
        className,
      )}
      {...rest}
    >
      {children}
    </div>
  );
}
export function CardHeader({ className = "", children }) {
  return <div className={cn("px-6 py-4 border-b border-ldn-border flex items-center justify-between", className)}>{children}</div>;
}
export function CardBody({ className = "", children }) {
  return <div className={cn("p-6", className)}>{children}</div>;
}

// ── Badge ──
export function Badge({ tone = "neutral", className = "", children }) {
  const tones = {
    neutral: "bg-surface-warm text-ink-soft border border-ldn-border",
    brand: "bg-brand-soft text-brand-dark",
    pickup: "bg-pickup-soft text-pickup",
    dropoff: "bg-dropoff-soft text-dropoff",
    warn: "bg-yellow-100 text-yellow-900",
    danger: "bg-red-100 text-red-800",
    success: "bg-emerald-100 text-emerald-900",
  };
  return (
    <span className={cn("inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-extrabold tracking-wider uppercase", tones[tone], className)}>
      {children}
    </span>
  );
}

// ── Toggle ──
export function Toggle({ checked, onChange, disabled, label, hint }) {
  return (
    <div className="flex items-center justify-between gap-4">
      {label && (
        <div className="flex-1 min-w-0">
          <p className="m-0 text-sm font-bold text-ink">{label}</p>
          {hint && <p className="m-0 mt-1 text-xs text-muted leading-snug">{hint}</p>}
        </div>
      )}
      <button
        type="button"
        onClick={() => !disabled && onChange?.(!checked)}
        disabled={disabled}
        className={cn(
          "relative w-[60px] h-[32px] rounded-full transition shrink-0",
          checked ? "bg-brand" : "bg-gray-300",
          disabled ? "opacity-50 cursor-not-allowed" : "cursor-pointer",
        )}
        title={checked ? "ON — click to disable" : "OFF — click to enable"}
      >
        <span
          className={cn(
            "absolute top-[3px] w-[26px] h-[26px] rounded-full bg-white shadow-pill transition-[left]",
            checked ? "left-[31px]" : "left-[3px]",
          )}
        />
      </button>
    </div>
  );
}

// ── Tabs ──
export function Tabs({ tabs, active, onChange, className = "" }) {
  return (
    <div className={cn("inline-flex p-1 bg-surface-warm rounded-xl border border-ldn-border", className)}>
      {tabs.map((t) => (
        <button
          key={t.id}
          onClick={() => onChange(t.id)}
          className={cn(
            "px-4 py-2 text-sm font-bold rounded-lg transition",
            active === t.id ? "bg-white text-ink shadow-sm" : "text-muted hover:text-ink",
          )}
        >
          {t.label}
          {typeof t.count === "number" && (
            <span className="ml-2 text-[10px] font-bold text-muted">{t.count}</span>
          )}
        </button>
      ))}
    </div>
  );
}

// ── Table ──
export function Table({ className = "", children }) {
  return <div className={cn("bg-white rounded-2xl border border-ldn-border overflow-hidden", className)}>{children}</div>;
}
export function TableHeader({ children, className = "" }) {
  return (
    <div className={cn("flex items-center px-4 py-3 bg-surface-warm text-[11px] font-extrabold uppercase tracking-wider text-muted border-b border-ldn-border", className)}>
      {children}
    </div>
  );
}
export function TableRow({ className = "", children, ...rest }) {
  return (
    <div className={cn("flex items-center px-4 py-3 border-b border-ldn-border last:border-b-0 hover:bg-surface-warm", className)} {...rest}>
      {children}
    </div>
  );
}

// ── Modal / Lightbox ──
export function Modal({ open, onClose, title, children, className = "" }) {
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => e.key === "Escape" && onClose?.();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60" onClick={onClose}>
      <div ref={ref} className={cn("bg-white rounded-2xl w-full max-w-lg max-h-[90vh] overflow-auto shadow-hover", className)} onClick={(e) => e.stopPropagation()}>
        {title && (
          <div className="px-6 py-4 border-b border-ldn-border flex items-center justify-between">
            <h2 className="m-0 text-lg font-extrabold text-ink">{title}</h2>
            <button onClick={onClose} className="text-muted hover:text-ink text-xl">✕</button>
          </div>
        )}
        <div className="p-6">{children}</div>
      </div>
    </div>
  );
}

export function Lightbox({ src, onClose }) {
  if (!src) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-4" onClick={onClose}>
      <img src={src} alt="" className="max-w-full max-h-full rounded-lg shadow-hover" onClick={(e) => e.stopPropagation()} />
      <button onClick={onClose} className="absolute top-4 right-6 text-white text-3xl hover:opacity-70">✕</button>
    </div>
  );
}

// ── StatTile ──
export function StatTile({ label, value, sublabel, tone = "neutral" }) {
  const accents = {
    neutral: "border-ldn-border",
    brand: "border-brand-soft",
    danger: "border-dropoff-soft",
    warn: "border-yellow-200",
  };
  return (
    <div className={cn("bg-white rounded-xl border p-4", accents[tone])}>
      <p className="m-0 text-[10px] font-extrabold uppercase tracking-wider text-muted">{label}</p>
      <p className="m-0 mt-1 text-3xl font-extrabold text-ink tabular-nums">{value}</p>
      {sublabel && <p className="m-0 mt-1 text-xs text-muted">{sublabel}</p>}
    </div>
  );
}

// ── ProgressBar ──
export function ProgressBar({ value, total, className = "" }) {
  const pct = total > 0 ? Math.min(100, Math.round((value / total) * 100)) : 0;
  return (
    <div className={cn("relative w-full h-2 rounded-full bg-surface-warm overflow-hidden", className)}>
      <div className="absolute inset-y-0 left-0 bg-brand transition-[width] duration-300" style={{ width: `${pct}%` }} />
    </div>
  );
}

// ── EmptyState ──
export function EmptyState({ icon = "📭", title, description, action }) {
  return (
    <div className="text-center py-12 px-6">
      <div className="text-4xl mb-3">{icon}</div>
      <h3 className="m-0 text-lg font-extrabold text-ink">{title}</h3>
      {description && <p className="m-0 mt-2 text-sm text-muted max-w-md mx-auto leading-relaxed">{description}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}
