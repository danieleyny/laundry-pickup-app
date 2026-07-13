"use client";
import { useEffect, useState } from "react";
import { Button, Card, CardBody, Badge, EmptyState, Modal } from "../components/ui";

function Field({ label, value, onChange, placeholder = "" }) {
  return (
    <label className="block">
      <span className="block text-xs font-bold text-ink-soft mb-1">{label}</span>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full px-3 py-2 text-sm border border-ldn-border rounded-lg outline-none focus:border-brand"
      />
    </label>
  );
}

const AREA = {
  uptown: { day1: "Friday", day2: "Saturday", dropoffDay: "Monday" },
  downtown: { day1: "Tuesday", day2: "Thursday", dropoffDay: "Friday" },
};

// Must match stopKey() in lib/route-geo.js (address lowercased+trimmed, unit trimmed)
// so the saved order lines up with how the server re-applies it.
const stopKey = (s) => `${(s.address || "").toLowerCase().trim()}|${(s.unit || "").trim()}`;

export function RouteTab({ pin, area, settings, apiFetch }) {
  const config = AREA[area];
  const [day, setDay] = useState(config.day1);
  const [pickupList, setPickupList] = useState(null);
  const [items, setItems] = useState([]);      // working copy the admin can reorder
  const [dirty, setDirty] = useState(false);   // unsaved manual reordering
  const [savingOrder, setSavingOrder] = useState(false);
  const [orderMsg, setOrderMsg] = useState(null);
  const [loading, setLoading] = useState(false);
  const [optimizing, setOptimizing] = useState(false);
  const [optMsg, setOptMsg] = useState(null);
  const [dragIndex, setDragIndex] = useState(null);
  const [overIndex, setOverIndex] = useState(null);
  const [removingKey, setRemovingKey] = useState(null);
  const [addOpen, setAddOpen] = useState(false);
  const [addDraft, setAddDraft] = useState({ address: "", unit: "", entryMethod: "", type: "pickup" });
  const [addingStop, setAddingStop] = useState(false);

  const load = async (chosenDay = day) => {
    setLoading(true);
    try {
      const data = await apiFetch("/api/pickup-list", { area, day: chosenDay });
      setPickupList(data);
      setItems(data?.pickupList || []);
      setDirty(false);
      setOrderMsg(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { setDay(config.day1); }, [area]);
  useEffect(() => { load(day); }, [area, day]);

  // ── Drag and drop reordering ──────────────────────────────────────────
  const onDragStart = (e, i) => {
    setDragIndex(i);
    e.dataTransfer.effectAllowed = "move";
    try { e.dataTransfer.setData("text/plain", String(i)); } catch {}
  };
  const onDragOver = (e, i) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    if (i !== overIndex) setOverIndex(i);
  };
  const onDrop = (e, i) => {
    e.preventDefault();
    // Source index comes from the drag payload (set in onDragStart) rather than
    // React state — state may not have flushed between dragstart and drop.
    let from = dragIndex;
    const raw = e.dataTransfer.getData("text/plain");
    const parsed = parseInt(raw, 10);
    if (!Number.isNaN(parsed)) from = parsed;
    setDragIndex(null);
    setOverIndex(null);
    if (from === null || from === undefined || from === i) return;
    const next = items.slice();
    const [moved] = next.splice(from, 1);
    next.splice(i, 0, moved);
    setItems(next);
    setDirty(true);
    setOrderMsg(null);
  };
  const onDragEnd = () => { setDragIndex(null); setOverIndex(null); };

  const saveOrder = async () => {
    setSavingOrder(true);
    setOrderMsg(null);
    try {
      const res = await fetch("/api/route-order", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pin, area, day, order: items.map(stopKey) }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Save failed");
      setOrderMsg({ ok: true, text: `Saved manual order of ${data.count} stops.` });
      setDirty(false);
    } catch (e) {
      setOrderMsg({ ok: false, text: e.message });
    } finally {
      setSavingOrder(false);
    }
  };

  // ── Remove a stop from the route ──────────────────────────────────────
  const removeStop = async (s) => {
    const label = `${s.address}${s.unit ? ` · Unit ${s.unit}` : ""}`;
    if (!confirm(`Remove ${label} from the ${day} route?`)) return;
    setRemovingKey(stopKey(s));
    setOrderMsg(null);
    try {
      // Manually-added stops (driver/admin/late-signup adds + their day2 mirrors)
      // must be undone with "undo-add": a plain "remove" edit gets re-applied by
      // the matching "add" edit, so the stop bounces straight back ("glitch").
      // Normal confirmation stops use "remove".
      const action = s.isManual ? "undo-add" : "remove";
      const res = await fetch("/api/route-edits", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pin, area, day, action, address: s.address, unit: s.unit || "" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Remove failed");
      // Drop it from the visible list immediately (optimistic) — don't depend on a
      // refetch that could hit the Sheets rate limit and leave the row stranded.
      // Also preserves any unsaved reordering the admin already did.
      setItems((prev) => prev.filter((x) => stopKey(x) !== stopKey(s)));
      setOrderMsg({ ok: true, text: `Removed ${label} from the ${day} route.` });
    } catch (e) {
      setOrderMsg({ ok: false, text: e.message });
    } finally {
      setRemovingKey(null);
    }
  };

  // ── Add a stop manually ────────────────────────────────────────────────
  const openAdd = () => {
    setAddDraft({ address: "", unit: "", entryMethod: "", type: "pickup" });
    setOrderMsg(null);
    setAddOpen(true);
  };
  const submitAdd = async () => {
    if (!addDraft.address.trim()) {
      setOrderMsg({ ok: false, text: "Address is required." });
      return;
    }
    setAddingStop(true);
    setOrderMsg(null);
    try {
      const res = await fetch("/api/route-edits", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          pin,
          area,
          day,
          action: "add",
          address: addDraft.address.trim(),
          unit: addDraft.unit.trim(),
          entryMethod: addDraft.entryMethod.trim(),
          type: addDraft.type,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Add failed");
      setAddOpen(false);
      const label = `${addDraft.address.trim()}${addDraft.unit.trim() ? ` · Unit ${addDraft.unit.trim()}` : ""}`;
      setOrderMsg({ ok: true, text: `Added ${label} to ${day} as ${addDraft.type}.` });
      await load(day);
    } catch (e) {
      setOrderMsg({ ok: false, text: e.message });
    } finally {
      setAddingStop(false);
    }
  };

  const optimize = async () => {
    if (!confirm(`Run route optimizer for ${day} ${area}? This will reorder stops based on real travel times and save the new order.`)) return;
    setOptimizing(true);
    setOptMsg(null);
    try {
      const res = await fetch("/api/route/optimize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pin, area, day }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Optimizer failed");
      setOptMsg({ ok: true, text: `Reordered ${data.stops?.length || 0} stops in ${data.elapsedMs || 0}ms.` });
      await load(day);
    } catch (e) {
      setOptMsg({ ok: false, text: e.message });
    } finally {
      setOptimizing(false);
    }
  };

  const downloadXlsx = async () => {
    const params = new URLSearchParams({ pin, area, day });
    window.open(`/api/pickup-list-xlsx?${params.toString()}`, "_blank");
  };

  const optimizerEnabled = settings?.route_optimizer_enabled === true;

  return (
    <div className="space-y-5">
      <Card>
        <CardBody>
          <div className="flex flex-wrap items-end justify-between gap-3 mb-4">
            <div>
              <p className="m-0 text-[10px] font-extrabold uppercase tracking-wider text-muted">Route builder</p>
              <h2 className="m-0 mt-1 text-2xl font-extrabold text-ink">
                {day} <span className="text-muted font-bold">· {area}</span>
              </h2>
            </div>
            <div className="flex gap-2 items-center">
              <div className="inline-flex p-1 bg-surface-warm rounded-xl border border-ldn-border">
                {[config.day1, config.day2, config.dropoffDay].filter(Boolean).map((d) => (
                  <button key={d} onClick={() => setDay(d)} className={"px-3 py-1.5 text-xs font-extrabold rounded-lg " + (day === d ? "bg-white text-ink shadow-sm" : "text-muted")}>
                    {d}
                  </button>
                ))}
              </div>
              {dirty && (
                <Button variant="primary" size="sm" onClick={saveOrder} disabled={savingOrder}>
                  {savingOrder ? "Saving…" : "💾 Save order"}
                </Button>
              )}
              <Button variant="secondary" size="sm" onClick={() => load(day)} disabled={loading}>
                {dirty ? "↩ Discard" : "↻ Reload"}
              </Button>
              <Button variant="primary" size="sm" onClick={openAdd}>+ Add stop</Button>
              <Button variant="secondary" size="sm" onClick={downloadXlsx}>⬇ Excel</Button>
              <Button
                variant={optimizerEnabled ? "primary" : "ghost"}
                size="sm"
                onClick={optimize}
                disabled={optimizing || !optimizerEnabled}
                title={optimizerEnabled ? "" : "Enable in Settings → Route optimizer"}
              >
                {optimizing ? "Optimizing…" : "✨ Optimize route"}
              </Button>
            </div>
          </div>

          {optMsg && (
            <div className={"mb-4 px-4 py-3 rounded-xl text-sm " + (optMsg.ok ? "bg-brand-soft text-brand-dark" : "bg-dropoff-soft text-dropoff")}>
              {optMsg.text}
            </div>
          )}
          {orderMsg && (
            <div className={"mb-4 px-4 py-3 rounded-xl text-sm " + (orderMsg.ok ? "bg-brand-soft text-brand-dark" : "bg-dropoff-soft text-dropoff")}>
              {orderMsg.text}
            </div>
          )}
          {dirty ? (
            <div className="mb-4 px-4 py-3 rounded-xl text-sm bg-yellow-50 border border-yellow-200 text-yellow-900">
              Unsaved reordering — click <strong>Save order</strong> to keep it, or <strong>Discard</strong> to revert.
            </div>
          ) : (
            items.length > 0 && (
              <p className="mb-3 text-xs text-muted">Drag a row by the <span className="font-bold">⠿</span> handle to reorder · click <span className="font-bold text-dropoff">✕</span> to remove a stop.</p>
            )
          )}

          {pickupList ? (
            items.length ? (
              <div className="rounded-xl border border-ldn-border overflow-hidden">
                <div className="flex items-center px-3 py-2 bg-surface-warm text-[10px] font-extrabold tracking-wider uppercase text-muted">
                  <div className="w-12">#</div>
                  <div className="flex-[2] min-w-0">Address</div>
                  <div className="flex-1">Entry</div>
                  <div className="w-16 text-center">Type</div>
                  <div className="w-10 text-center">Remove</div>
                </div>
                {items.map((s, i) => (
                  <div
                    key={stopKey(s) + ":" + i}
                    draggable
                    onDragStart={(e) => onDragStart(e, i)}
                    onDragOver={(e) => onDragOver(e, i)}
                    onDrop={(e) => onDrop(e, i)}
                    onDragEnd={onDragEnd}
                    className={
                      "flex items-center px-3 py-2 border-b border-ldn-border last:border-b-0 text-xs cursor-move select-none " +
                      (dragIndex === i ? "opacity-40 " : "") +
                      (overIndex === i && dragIndex !== null && dragIndex !== i ? "border-t-2 border-brand bg-brand-soft " : "")
                    }
                  >
                    <div className="w-12 flex items-center gap-1.5 text-muted font-bold">
                      <span className="text-base leading-none text-muted cursor-grab" title="Drag to reorder">⠿</span>
                      <span>{i + 1}</span>
                    </div>
                    <div className="flex-[2] min-w-0">
                      <div className="font-bold text-ink truncate">
                        {s.address}
                        {s.unit && <span className="text-muted font-medium"> · Unit {s.unit}</span>}
                      </div>
                      <div className="flex items-center gap-1 mt-0.5 text-[10px]">
                        {s.isPermanentCycle && <Badge tone="brand">Permanent</Badge>}
                        {s.isAuto && !s.isPermanentCycle && <Badge tone="neutral">Standing</Badge>}
                        {s.addedBy === "driver" && <Badge tone="success">Driver</Badge>}
                        {s.addedBy?.includes("late-signup") && <Badge tone="warn">Late</Badge>}
                        {s.addedBy?.includes("admin") && <Badge tone="brand">Admin</Badge>}
                      </div>
                    </div>
                    <div className="flex-1 text-muted">{s.entryMethod}</div>
                    <div className="w-16 text-center">
                      <Badge tone={s.type === "dropoff" ? "dropoff" : "pickup"}>{s.type === "dropoff" ? "DROP" : "PICK"}</Badge>
                    </div>
                    <div className="w-10 flex items-center justify-center">
                      <button
                        draggable={false}
                        onClick={(e) => { e.stopPropagation(); removeStop(s); }}
                        onMouseDown={(e) => e.stopPropagation()}
                        disabled={removingKey === stopKey(s)}
                        title="Remove from route"
                        className="w-6 h-6 rounded-md border border-dropoff/40 text-dropoff font-bold leading-none hover:bg-dropoff-soft disabled:opacity-40"
                      >
                        {removingKey === stopKey(s) ? "…" : "✕"}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <EmptyState icon="📭" title="Empty route" description={`No confirmations yet for ${day}.`} />
            )
          ) : loading ? (
            <p className="text-center text-muted py-10">Loading…</p>
          ) : null}
        </CardBody>
      </Card>

      <Modal open={addOpen} onClose={() => setAddOpen(false)} title={`Add stop to ${day} ${area}`}>
        <div className="space-y-3">
          <Field label="Address" value={addDraft.address} onChange={(v) => setAddDraft({ ...addDraft, address: v })} placeholder="e.g. 234 West 13th" />
          <Field label="Unit (optional)" value={addDraft.unit} onChange={(v) => setAddDraft({ ...addDraft, unit: v })} placeholder="e.g. 36" />
          <Field label="Entry method (optional)" value={addDraft.entryMethod} onChange={(v) => setAddDraft({ ...addDraft, entryMethod: v })} placeholder="e.g. Doorman, lockbox 1234" />
          <div>
            <span className="block text-xs font-bold text-ink-soft mb-1">Type</span>
            <div className="inline-flex p-1 bg-surface-warm rounded-xl border border-ldn-border">
              {["pickup", "dropoff"].map((t) => (
                <button
                  key={t}
                  onClick={() => setAddDraft({ ...addDraft, type: t })}
                  className={"px-3 py-1.5 text-xs font-extrabold rounded-lg capitalize " + (addDraft.type === t ? "bg-white text-ink shadow-sm" : "text-muted")}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>
          {addDraft.type === "pickup" && (day === config.day1 || day === config.day2) && (
            <p className="text-[11px] text-muted">
              A {day === config.day1 ? config.day2 : config.dropoffDay} dropoff will be added automatically (mirror).
            </p>
          )}
          <div className="flex gap-2 justify-end pt-2">
            <Button variant="secondary" onClick={() => setAddOpen(false)} disabled={addingStop}>Cancel</Button>
            <Button variant="primary" onClick={submitAdd} disabled={addingStop || !addDraft.address.trim()}>
              {addingStop ? "Adding…" : "Add"}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
