"use client";

export function AreaSwitcher({ area, onChange }) {
  return (
    <div className="inline-flex p-1 bg-surface-warm rounded-xl border border-ldn-border">
      {["downtown", "uptown"].map((a) => (
        <button
          key={a}
          onClick={() => onChange(a)}
          className={
            "px-3 py-1.5 text-xs font-extrabold rounded-lg transition uppercase tracking-wider " +
            (area === a ? "bg-brand text-white" : "text-muted hover:text-ink")
          }
        >
          {a}
        </button>
      ))}
    </div>
  );
}
