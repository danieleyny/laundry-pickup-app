"use client";
import { useState } from "react";
import { Button, Card, CardBody, Toggle, Badge } from "../components/ui";

const KEYS = [
  {
    key: "email_scheduling_enabled",
    title: "Automated reminders",
    hint: "Master switch for the 7:20 AM ET cron. When OFF, the cron skips its send and no one gets a reminder.",
  },
  {
    key: "driver_emails_enabled",
    title: "Driver issue emails to tenants",
    hint: "When ON, missed-pickup emails go to the actual tenant. When OFF (recommended during testing), they redirect to laundrydaynyc@gmail.com.",
  },
  {
    key: "test_mode_enabled",
    title: "Driver test mode",
    hint: "When ON, anything the driver does in the app does NOT save. Use to demo or train without polluting real data.",
  },
  {
    key: "route_optimizer_enabled",
    title: "Mapbox route optimizer",
    hint: "When ON, the 'Optimize route' button uses real driving times from Mapbox + a TSP solver to reorder stops. Free up to 100k geocodes + 100k matrix calls/month.",
  },
  {
    key: "eta_alerts_enabled",
    title: "Live ETA alerts to customers",
    hint: "When ON, customers get a heads-up email ~20 min before their stop. One per customer per route. See lead-time in advanced settings.",
  },
];

export function SettingsTab({ pin, settings, onLoadSettings }) {
  const [busyKey, setBusyKey] = useState(null);
  const [dark, setDark] = useState(() => {
    if (typeof window === "undefined") return false;
    return document.documentElement.classList.contains("dark");
  });

  const toggle = async (k) => {
    if (!settings) return;
    setBusyKey(k);
    try {
      const newVal = !settings[k];
      const res = await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pin, key: k, value: newVal ? "true" : "false" }),
      });
      if (!res.ok) throw new Error("Failed");
      await onLoadSettings?.();
    } catch (e) {
      alert(e.message);
    } finally {
      setBusyKey(null);
    }
  };

  const toggleDark = () => {
    const next = !dark;
    setDark(next);
    try {
      document.documentElement.classList.toggle("dark", next);
      localStorage.setItem("ldn-theme", next ? "dark" : "light");
    } catch {}
  };

  return (
    <div className="space-y-5">
      <Card>
        <CardBody>
          <p className="m-0 text-[10px] font-extrabold uppercase tracking-wider text-muted">Theme</p>
          <h2 className="m-0 mt-1 text-xl font-extrabold text-ink mb-4">Appearance</h2>
          <Toggle
            checked={dark}
            onChange={toggleDark}
            label={dark ? "Dark mode" : "Light mode"}
            hint="Saved locally to your browser. Switches all admin pages."
          />
        </CardBody>
      </Card>

      <Card>
        <CardBody>
          <p className="m-0 text-[10px] font-extrabold uppercase tracking-wider text-muted">Feature flags</p>
          <h2 className="m-0 mt-1 text-xl font-extrabold text-ink mb-4">Toggles</h2>
          {settings ? (
            <div className="space-y-5">
              {KEYS.map(({ key, title, hint }) => (
                <Toggle
                  key={key}
                  checked={!!settings[key]}
                  onChange={() => toggle(key)}
                  disabled={busyKey === key}
                  label={title}
                  hint={hint}
                />
              ))}
            </div>
          ) : (
            <p className="text-muted text-sm">Loading…</p>
          )}
        </CardBody>
      </Card>

      <Card>
        <CardBody>
          <p className="m-0 text-[10px] font-extrabold uppercase tracking-wider text-muted">Last cron run</p>
          <h2 className="m-0 mt-1 text-lg font-extrabold text-ink">
            {settings?.last_cron_run_time ? new Date(settings.last_cron_run_time).toLocaleString("en-US", { timeZone: "America/New_York", dateStyle: "medium", timeStyle: "short" }) : "—"}{" "}
            {settings?.last_cron_run_status && (
              <Badge tone={settings.last_cron_run_status === "success" ? "success" : "danger"} className="ml-2">{settings.last_cron_run_status}</Badge>
            )}
          </h2>
          <pre className="mt-3 text-xs bg-surface-warm p-3 rounded-lg overflow-auto">{settings?.last_cron_run_summary || "(no summary)"}</pre>
        </CardBody>
      </Card>
    </div>
  );
}
