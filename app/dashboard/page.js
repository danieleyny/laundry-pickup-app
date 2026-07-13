"use client";
import { useCallback, useEffect, useState } from "react";
import { Card, CardBody, Button } from "../components/ui";
import { AreaSwitcher } from "./AreaSwitcher";
import { TodayTab } from "./TodayTab";
import { RouteTab } from "./RouteTab";
import { CustomersTab } from "./CustomersTab";
import { AnalyticsTab } from "./AnalyticsTab";
import { SettingsTab } from "./SettingsTab";

const SESSION_KEY = "ldn_admin_session";
const SESSION_TTL_MS = 24 * 60 * 60 * 1000;

const TABS = [
  { id: "today", label: "Today" },
  { id: "route", label: "Route" },
  { id: "customers", label: "Customers" },
  { id: "analytics", label: "Analytics" },
  { id: "settings", label: "Settings" },
];

export default function DashboardPage() {
  const [pin, setPin] = useState("");
  const [authenticated, setAuthenticated] = useState(false);
  const [restoring, setRestoring] = useState(true);
  const [area, setArea] = useState("downtown");
  const [tab, setTab] = useState("today");
  const [settings, setSettings] = useState(null);
  const [error, setError] = useState("");

  // ── PIN session restore (24h) ──
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(SESSION_KEY);
      if (raw) {
        const s = JSON.parse(raw);
        if (s.pin && s.expiresAt && s.expiresAt > Date.now()) {
          setPin(s.pin);
          setAuthenticated(true);
          setArea(s.area || "downtown");
        }
      }
    } catch {}
    setRestoring(false);
  }, []);

  // Persist area choice across reloads while authenticated
  useEffect(() => {
    if (!authenticated) return;
    try {
      const raw = window.localStorage.getItem(SESSION_KEY);
      const s = raw ? JSON.parse(raw) : { pin, expiresAt: Date.now() + SESSION_TTL_MS };
      s.area = area;
      window.localStorage.setItem(SESSION_KEY, JSON.stringify(s));
    } catch {}
  }, [area, authenticated, pin]);

  const apiFetch = useCallback(
    async (path, extraParams = {}) => {
      const params = new URLSearchParams({ pin, ...extraParams });
      const res = await fetch(`${path}?${params.toString()}`);
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || `HTTP ${res.status}`);
      return res.json();
    },
    [pin],
  );

  const loadSettings = useCallback(async () => {
    try {
      const data = await apiFetch("/api/settings");
      setSettings(data);
    } catch (e) {
      setError(e.message);
    }
  }, [apiFetch]);

  const handleLogin = async () => {
    setError("");
    try {
      const res = await fetch(`/api/settings?pin=${encodeURIComponent(pin)}`);
      if (!res.ok) throw new Error("Wrong PIN");
      const data = await res.json();
      setSettings(data);
      setAuthenticated(true);
      try {
        window.localStorage.setItem(
          SESSION_KEY,
          JSON.stringify({ pin, expiresAt: Date.now() + SESSION_TTL_MS, area }),
        );
      } catch {}
    } catch (e) {
      setError(e.message);
    }
  };

  const handleLogout = () => {
    try { window.localStorage.removeItem(SESSION_KEY); } catch {}
    setAuthenticated(false);
    setPin("");
    setSettings(null);
  };

  useEffect(() => {
    if (authenticated && !settings) loadSettings();
  }, [authenticated, settings, loadSettings]);

  if (restoring) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-surface-warm">
        <p className="text-muted">Loading…</p>
      </div>
    );
  }

  if (!authenticated) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-brand-soft via-surface-warm to-brand-soft p-5">
        <Card className="w-full max-w-md">
          <CardBody>
            <div className="text-center mb-6">
              <p className="m-0 text-[11px] font-extrabold uppercase tracking-[2.2px] text-brand">Laundry Day NYC</p>
              <h1 className="m-0 mt-2 text-2xl font-extrabold text-ink">Admin dashboard</h1>
            </div>
            <label className="block">
              <span className="block text-xs font-bold text-ink-soft mb-1">Admin PIN</span>
              <input
                type="password"
                value={pin}
                onChange={(e) => setPin(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleLogin()}
                placeholder="••••"
                className="w-full px-3 py-3 text-base border-2 border-ldn-border rounded-lg outline-none focus:border-brand text-center tracking-widest font-mono"
              />
            </label>
            {error && <p className="mt-3 text-sm text-dropoff m-0">{error}</p>}
            <Button variant="primary" className="w-full mt-5" onClick={handleLogin}>
              Sign in
            </Button>
          </CardBody>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[var(--ldn-bg)] text-ink dark:text-[var(--ldn-ink)]">
      {/* Header */}
      <header className="sticky top-0 z-30 bg-white/90 backdrop-blur border-b border-ldn-border dark:bg-[var(--ldn-surface)]/90">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3">
            <span className="h-1 w-9 bg-brand rounded-full" />
            <div>
              <p className="m-0 text-[10px] font-extrabold tracking-[2.2px] text-brand uppercase">Laundry Day NYC</p>
              <p className="m-0 text-sm font-extrabold text-ink dark:text-[var(--ldn-ink)]">Admin</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <AreaSwitcher area={area} onChange={setArea} />
            <Button variant="ghost" size="sm" onClick={handleLogout}>Sign out</Button>
          </div>
        </div>
        <div className="max-w-6xl mx-auto px-4 pb-3 -mt-1 flex gap-1 overflow-x-auto">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={
                "px-4 py-2 text-sm font-bold rounded-lg transition whitespace-nowrap " +
                (tab === t.id ? "bg-brand text-white" : "text-muted hover:text-ink hover:bg-surface-warm")
              }
            >
              {t.label}
            </button>
          ))}
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-5">
        {tab === "today" && (
          <TodayTab pin={pin} area={area} settings={settings} onLoadSettings={loadSettings} apiFetch={apiFetch} />
        )}
        {tab === "route" && (
          <RouteTab pin={pin} area={area} settings={settings} apiFetch={apiFetch} />
        )}
        {tab === "customers" && (
          <CustomersTab pin={pin} area={area} apiFetch={apiFetch} />
        )}
        {tab === "analytics" && (
          <AnalyticsTab pin={pin} area={area} apiFetch={apiFetch} />
        )}
        {tab === "settings" && (
          <SettingsTab pin={pin} settings={settings} onLoadSettings={loadSettings} />
        )}
      </main>
    </div>
  );
}
