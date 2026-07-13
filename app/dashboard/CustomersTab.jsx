"use client";
import { useEffect, useState } from "react";
import { Button, Card, CardBody, Badge, EmptyState, Modal, Lightbox } from "../components/ui";

export function CustomersTab({ pin, area, apiFetch }) {
  const [customers, setCustomers] = useState(null);
  const [loading, setLoading] = useState(false);
  const [q, setQ] = useState("");
  const [selected, setSelected] = useState(null); // customer object
  const [editing, setEditing] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [lightboxUrl, setLightboxUrl] = useState(null);
  const [draft, setDraft] = useState({ address: "", unit: "", name: "", email: "", phone: "" });
  const [saveError, setSaveError] = useState("");

  const load = async (search = q) => {
    setLoading(true);
    try {
      const data = await apiFetch("/api/admin/customers", { area, q: search });
      setCustomers(data.customers || []);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(""); }, [area]);

  const onSearch = (val) => {
    setQ(val);
    if (val.length === 0 || val.length >= 2) load(val);
  };

  const openAdd = () => {
    setDraft({ address: "", unit: "", name: "", email: "", phone: "" });
    setSaveError("");
    setAddOpen(true);
  };

  const openEdit = (c) => {
    setDraft({
      rowIndex: c.rowIndex,
      address: c.address || "",
      unit: c.unit || "",
      name: c.name || "",
      email: c.emailRaw || c.emails?.[0] || "",
      phone: c.phone || "",
    });
    setSaveError("");
    setEditing(true);
  };

  const save = async (action) => {
    setSaveError("");
    try {
      const res = await fetch("/api/admin/customers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pin, area, action, ...draft }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Save failed");
      setAddOpen(false);
      setEditing(false);
      setSelected(null);
      await load(q);
    } catch (e) {
      setSaveError(e.message);
    }
  };

  const optOut = async (email) => {
    if (!confirm(`Soft opt-out ${email}? They'll be filtered out of automated reminders but stay in the customer sheet.`)) return;
    try {
      const res = await fetch("/api/admin/customers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pin, area, action: "opt-out", email }),
      });
      if (!res.ok) throw new Error("Opt-out failed");
      await load(q);
    } catch (e) {
      alert(e.message);
    }
  };

  return (
    <div className="space-y-5">
      <Card>
        <CardBody>
          <div className="flex flex-wrap items-end justify-between gap-3 mb-4">
            <div>
              <p className="m-0 text-[10px] font-extrabold uppercase tracking-wider text-muted">Customer book</p>
              <h2 className="m-0 mt-1 text-2xl font-extrabold text-ink">
                {customers ? `${customers.length} customers` : "Loading…"} <span className="text-muted font-bold">· {area}</span>
              </h2>
            </div>
            <div className="flex gap-2 items-center">
              <input
                type="text"
                value={q}
                onChange={(e) => onSearch(e.target.value)}
                placeholder="Search by name, address, email…"
                className="px-3 py-2 text-sm border border-ldn-border rounded-lg w-72 max-w-full outline-none focus:border-brand"
              />
              <Button variant="primary" size="sm" onClick={openAdd}>+ Add customer</Button>
            </div>
          </div>

          {customers === null ? (
            <p className="text-center text-muted py-10">Loading…</p>
          ) : customers.length === 0 ? (
            <EmptyState icon="🔍" title="No customers" description={q ? `Nothing matches "${q}".` : "The customer sheet is empty."} />
          ) : (
            <div className="rounded-xl border border-ldn-border overflow-hidden">
              <div className="flex items-center px-3 py-2 bg-surface-warm text-[10px] font-extrabold tracking-wider uppercase text-muted">
                <div className="flex-[2] min-w-0">Address</div>
                <div className="flex-[2] min-w-0">Name</div>
                <div className="flex-[2] min-w-0">Email</div>
                <div className="w-24 text-right">Actions</div>
              </div>
              {customers.map((c, i) => (
                <div key={i} className={"flex items-center px-3 py-2 border-b border-ldn-border last:border-b-0 text-xs hover:bg-surface-warm cursor-pointer " + (c.optedOut ? "opacity-60" : "")}
                     onClick={() => setSelected(c)}>
                  <div className="flex-[2] min-w-0">
                    <div className="font-bold text-ink truncate">
                      {c.address}{c.unit && <span className="text-muted font-medium"> · {c.unit}</span>}
                    </div>
                  </div>
                  <div className="flex-[2] min-w-0 text-ink-soft truncate">{c.name}</div>
                  <div className="flex-[2] min-w-0 text-muted truncate">{c.emails?.join(", ")}</div>
                  <div className="w-24 text-right flex justify-end gap-1">
                    {c.optedOut && <Badge tone="warn">OPTED OUT</Badge>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardBody>
      </Card>

      {/* Customer drawer */}
      <Modal open={!!selected} onClose={() => setSelected(null)} title={selected?.name || selected?.address || "Customer"}>
        {selected && (
          <CustomerDrawer
            customer={selected}
            pin={pin}
            area={area}
            onOptOut={() => optOut(selected.emails?.[0])}
            onEdit={() => { setSelected(null); setTimeout(() => openEdit(selected), 50); }}
            apiFetch={apiFetch}
            onLightbox={setLightboxUrl}
          />
        )}
      </Modal>

      {/* Add / edit modal */}
      <Modal open={addOpen || editing} onClose={() => { setAddOpen(false); setEditing(false); }} title={editing ? "Edit customer" : "Add customer"}>
        <div className="space-y-3">
          <Field label="Address" value={draft.address} onChange={(v) => setDraft({ ...draft, address: v })} />
          <Field label="Unit (optional)" value={draft.unit} onChange={(v) => setDraft({ ...draft, unit: v })} />
          <Field label="Name" value={draft.name} onChange={(v) => setDraft({ ...draft, name: v })} />
          <Field label="Email(s) — comma-separated for multiple" value={draft.email} onChange={(v) => setDraft({ ...draft, email: v })} />
          <Field label="Phone (optional)" value={draft.phone} onChange={(v) => setDraft({ ...draft, phone: v })} />
          {saveError && <p className="text-sm text-dropoff m-0">{saveError}</p>}
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" onClick={() => { setAddOpen(false); setEditing(false); }}>Cancel</Button>
            <Button variant="primary" onClick={() => save(editing ? "update" : "add")}>
              {editing ? "Save changes" : "Add"}
            </Button>
          </div>
        </div>
      </Modal>

      <Lightbox src={lightboxUrl} onClose={() => setLightboxUrl(null)} />
    </div>
  );
}

function Field({ label, value, onChange }) {
  return (
    <label className="block">
      <span className="block text-xs font-bold text-ink-soft mb-1">{label}</span>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full px-3 py-2 text-sm border border-ldn-border rounded-lg outline-none focus:border-brand"
      />
    </label>
  );
}

function CustomerDrawer({ customer, pin, area, onOptOut, onEdit, apiFetch, onLightbox }) {
  const [detail, setDetail] = useState(null);
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const d = await apiFetch("/api/admin/customers", { area, email: customer.emails?.[0] || "" });
        if (!cancelled) setDetail(d);
      } catch { /* ignore */ }
    };
    if (customer.emails?.[0]) load();
    return () => { cancelled = true; };
  }, [customer]);

  return (
    <div className="space-y-4">
      <div className="text-sm">
        <p className="m-0 text-base font-extrabold text-ink">{customer.address}{customer.unit && ` · Unit ${customer.unit}`}</p>
        <p className="m-0 mt-1 text-muted">{customer.name}</p>
        <p className="m-0 mt-1 text-muted">{customer.emails?.join(", ")}</p>
        {customer.phone && <p className="m-0 mt-1 text-muted">📞 {customer.phone}</p>}
        {customer.optedOut && <Badge tone="warn" className="mt-2">OPTED OUT</Badge>}
      </div>

      <div className="flex gap-2 flex-wrap">
        <Button variant="primary" size="sm" onClick={onEdit}>✎ Edit</Button>
        {!customer.optedOut && <Button variant="ghost" size="sm" onClick={onOptOut}>Opt out</Button>}
      </div>

      {detail?.dropoffs?.length > 0 && (
        <div>
          <p className="m-0 mt-3 text-[10px] font-extrabold uppercase tracking-wider text-muted">Drop-off proof gallery</p>
          <div className="mt-2 grid grid-cols-4 gap-2">
            {detail.dropoffs.slice(0, 12).map((d, i) => (
              <button key={i} onClick={() => onLightbox(d.photoUrl)} className="aspect-square rounded-lg overflow-hidden border border-ldn-border hover:border-brand transition">
                <img src={d.photoUrl} alt="" className="w-full h-full object-cover" />
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
