import { useState, useMemo, useEffect, useRef } from "react";
import { useLoadsStore, weekRangeFromKey, currentWeekKey, shiftWeekKey } from "../store/useLoadsStore";
import { useTrucksStore } from "../store/useTrucksStore";
import { useDriversStore } from "../store/useDriversStore";
import { useTimeOffStore } from "../store/useTimeOffStore";
import { auth } from "../lib/firebase";

const haulcarSyncEndpoint = import.meta.env.VITE_HAULCAR_SYNC_ENDPOINT || "/.netlify/functions/haulcarSync";

const LS_KEY = "loadsViewState";
function readPersistedState() {
  try { return JSON.parse(localStorage.getItem(LS_KEY) || "{}"); }
  catch { return {}; }
}
function writePersistedState(state) {
  try { localStorage.setItem(LS_KEY, JSON.stringify(state)); } catch { /* ignore */ }
}

function fmtMoney(v) {
  const n = Number(v) || 0;
  return n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
}
function fmtNum(v) {
  return Math.round(Number(v) || 0).toLocaleString();
}
function fmtRpm(v) {
  const n = Number(v) || 0;
  return n > 0 ? `$${n.toFixed(2)}` : "—";
}
function fmtDate(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
}

function statusColor(status) {
  const s = (status || "").toLowerCase();
  if (s.includes("deliver"))   return { bg: "#f0fdf4", color: "#15803d", border: "#86efac" };
  if (s.includes("pick"))      return { bg: "#eff6ff", color: "#1d4ed8", border: "#bfdbfe" };
  if (s.includes("transit") || s.includes("dispatch")) return { bg: "#fffbeb", color: "#92400e", border: "#fcd34d" };
  if (s.includes("cancel"))    return { bg: "#fef2f2", color: "#dc2626", border: "#fecaca" };
  if (s.includes("book"))      return { bg: "#f5f3ff", color: "#7c3aed", border: "#ddd6fe" };
  return { bg: "var(--bg-hover)", color: "var(--text-secondary)", border: "var(--border)" };
}

function StatusBadge({ status }) {
  const c = statusColor(status);
  return (
    <span style={{
      fontSize: 10, fontWeight: 700, padding: "2px 7px", borderRadius: 4,
      background: c.bg, color: c.color, border: `1px solid ${c.border}`,
      whiteSpace: "nowrap", textTransform: "capitalize",
    }}>
      {status || "—"}
    </span>
  );
}

/* ══════════════════════════════════════════════
   STATS BAR — totals across visible loads
══════════════════════════════════════════════ */
function StatsBar({ loads }) {
  const stats = useMemo(() => {
    const count = loads.length;
    const gross = loads.reduce((s, l) => s + (Number(l.rate) || 0), 0);
    const loadedMi = loads.reduce((s, l) => s + (Number(l.loadedMiles) || 0), 0);
    const emptyMi = loads.reduce((s, l) => s + (Number(l.emptyMiles) || 0), 0);
    const totalMi = loadedMi + emptyMi;
    const avgRpm = loadedMi > 0 ? gross / loadedMi : 0;
    const deadheadPct = totalMi > 0 ? (emptyMi / totalMi) * 100 : 0;
    return { count, gross, loadedMi, emptyMi, totalMi, avgRpm, deadheadPct };
  }, [loads]);

  const items = [
    { label: "Loads",      value: stats.count.toLocaleString(),       color: "#2563eb" },
    { label: "Gross",      value: fmtMoney(stats.gross),               color: "#16a34a" },
    { label: "Loaded mi",  value: fmtNum(stats.loadedMi),              color: "#0891b2" },
    { label: "Empty mi",   value: fmtNum(stats.emptyMi),               color: "#d97706" },
    { label: "Avg RPM",    value: fmtRpm(stats.avgRpm),                color: "#7c3aed" },
    { label: "Deadhead %", value: `${stats.deadheadPct.toFixed(1)}%`,  color: "#ea580c" },
  ];

  return (
    <div style={{
      display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: 10,
      padding: "12px 16px", background: "var(--bg-surface)",
      border: "1px solid var(--border)", borderRadius: 12, marginBottom: 14,
    }}>
      {items.map((s) => (
        <div key={s.label} style={{ textAlign: "left" }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: "var(--text-faint)", textTransform: "uppercase", letterSpacing: ".05em", marginBottom: 3 }}>
            {s.label}
          </div>
          <div style={{ fontSize: 18, fontWeight: 800, color: s.color, letterSpacing: "-0.5px" }}>
            {s.value}
          </div>
        </div>
      ))}
    </div>
  );
}

/* ══════════════════════════════════════════════
   LOADS TABLE — flat list view
══════════════════════════════════════════════ */
function LoadsTable({ loads, onLoadClick }) {
  if (loads.length === 0) {
    return (
      <div style={{ textAlign: "center", padding: "60px 0", fontSize: 14, color: "var(--text-faint)" }}>
        No loads in this period.
      </div>
    );
  }

  const cellStyle = { padding: "10px 12px", borderBottom: "1px solid var(--border)", fontSize: 12, verticalAlign: "middle" };
  const headStyle = { padding: "10px 12px", fontSize: 10, fontWeight: 700, color: "var(--text-faint)", textTransform: "uppercase", letterSpacing: ".05em", textAlign: "left", borderBottom: "1px solid var(--border)", whiteSpace: "nowrap" };

  return (
    <div style={{ background: "var(--bg-surface)", border: "1px solid var(--border)", borderRadius: 12, overflow: "hidden" }}>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr style={{ background: "var(--bg-hover)" }}>
            <th style={headStyle}>Pickup</th>
            <th style={headStyle}>From</th>
            <th style={headStyle}>To</th>
            <th style={headStyle}>Delivery</th>
            <th style={headStyle}>Truck</th>
            <th style={headStyle}>Driver</th>
            <th style={headStyle}>Dispatcher</th>
            <th style={headStyle}>Broker</th>
            <th style={{ ...headStyle, textAlign: "right" }}>Loaded</th>
            <th style={{ ...headStyle, textAlign: "right" }}>Empty</th>
            <th style={{ ...headStyle, textAlign: "right" }}>RPM</th>
            <th style={{ ...headStyle, textAlign: "right" }}>Rate</th>
            <th style={headStyle}>Status</th>
          </tr>
        </thead>
        <tbody>
          {loads.map((l) => (
            <tr key={l.id} style={{ cursor: onLoadClick ? "pointer" : "default" }} onClick={() => onLoadClick?.(l)}>
              <td style={{ ...cellStyle, fontWeight: 600, whiteSpace: "nowrap" }}>{fmtDate(l.puDate)}</td>
              <td style={cellStyle}>{l.puCity ? `${l.puCity}, ${l.puState || ""}` : "—"}</td>
              <td style={cellStyle}>{l.delCity ? `${l.delCity}, ${l.delState || ""}` : "—"}</td>
              <td style={{ ...cellStyle, color: "var(--text-muted)", whiteSpace: "nowrap" }}>{fmtDate(l.delDate)}</td>
              <td style={{ ...cellStyle, fontWeight: 700, fontFamily: "monospace" }}>{l.unit || "—"}</td>
              <td style={{ ...cellStyle }}>{l.driverName || "—"}</td>
              <td style={{ ...cellStyle, color: "var(--text-muted)" }}>{l.dispatcher || "—"}</td>
              <td style={{ ...cellStyle, color: "var(--text-muted)" }}>{l.broker || "—"}</td>
              <td style={{ ...cellStyle, textAlign: "right", fontFamily: "monospace" }}>{fmtNum(l.loadedMiles)}</td>
              <td style={{ ...cellStyle, textAlign: "right", fontFamily: "monospace", color: "var(--text-faint)" }}>{fmtNum(l.emptyMiles)}</td>
              <td style={{ ...cellStyle, textAlign: "right", fontFamily: "monospace", fontWeight: 600 }}>{fmtRpm(l.rpm)}</td>
              <td style={{ ...cellStyle, textAlign: "right", fontWeight: 700, color: "#16a34a" }}>{fmtMoney(l.rate)}</td>
              <td style={cellStyle}><StatusBadge status={l.status} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ══════════════════════════════════════════════
   GROUP TABLE — by truck or by driver
══════════════════════════════════════════════ */
function GroupTable({ loads, groupBy /* "unit" | "driver" */, trucks, drivers, onRowClick }) {
  const groups = useMemo(() => {
    const map = new Map();
    for (const l of loads) {
      let key = "(unassigned)";
      let label = "(unassigned)";
      if (groupBy === "unit") {
        key = l.unit || "(no unit)";
        label = key;
      } else {
        // by driver — use driverName from TMS directly
        const name = l.driverName || null;
        key = name || `unit-${l.unit || "unknown"}`;
        label = name || (l.unit ? `Unit ${l.unit} (no driver)` : "(no driver)");
      }
      if (!map.has(key)) map.set(key, { label, loads: [], gross: 0, loadedMi: 0, emptyMi: 0 });
      const g = map.get(key);
      g.loads.push(l);
      g.gross    += Number(l.rate) || 0;
      g.loadedMi += Number(l.loadedMiles) || 0;
      g.emptyMi  += Number(l.emptyMiles) || 0;
    }
    return [...map.values()]
      .map((g) => ({
        ...g,
        count: g.loads.length,
        avgRpm:      g.loadedMi > 0 ? g.gross / g.loadedMi : 0,
        deadheadPct: (g.loadedMi + g.emptyMi) > 0 ? (g.emptyMi / (g.loadedMi + g.emptyMi)) * 100 : 0,
      }))
      .sort((a, b) => b.gross - a.gross);
  }, [loads, groupBy, trucks, drivers]);

  if (groups.length === 0) {
    return (
      <div style={{ textAlign: "center", padding: "60px 0", fontSize: 14, color: "var(--text-faint)" }}>
        No data for this period.
      </div>
    );
  }

  const cellStyle = { padding: "11px 14px", borderBottom: "1px solid var(--border)", fontSize: 13, verticalAlign: "middle" };
  const headStyle = { padding: "10px 14px", fontSize: 10, fontWeight: 700, color: "var(--text-faint)", textTransform: "uppercase", letterSpacing: ".05em", textAlign: "left", borderBottom: "1px solid var(--border)", whiteSpace: "nowrap" };

  return (
    <div style={{ background: "var(--bg-surface)", border: "1px solid var(--border)", borderRadius: 12, overflow: "hidden" }}>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr style={{ background: "var(--bg-hover)" }}>
            <th style={headStyle}>{groupBy === "unit" ? "Unit" : "Driver"}</th>
            <th style={{ ...headStyle, textAlign: "right" }}>Loads</th>
            <th style={{ ...headStyle, textAlign: "right" }}>Loaded mi</th>
            <th style={{ ...headStyle, textAlign: "right" }}>Empty mi</th>
            <th style={{ ...headStyle, textAlign: "right" }}>Deadhead %</th>
            <th style={{ ...headStyle, textAlign: "right" }}>Avg RPM</th>
            <th style={{ ...headStyle, textAlign: "right" }}>Gross</th>
          </tr>
        </thead>
        <tbody>
          {groups.map((g) => (
            <tr key={g.label}
              onClick={onRowClick ? () => onRowClick(g) : undefined}
              style={{ cursor: onRowClick ? "pointer" : "default", transition: "background 120ms" }}
              onMouseEnter={onRowClick ? (e) => (e.currentTarget.style.background = "var(--bg-hover)") : undefined}
              onMouseLeave={onRowClick ? (e) => (e.currentTarget.style.background = "transparent") : undefined}
            >
              <td style={{ ...cellStyle, fontWeight: 700, color: onRowClick ? "#2563eb" : "inherit" }}>{g.label}</td>
              <td style={{ ...cellStyle, textAlign: "right", fontFamily: "monospace" }}>{g.count}</td>
              <td style={{ ...cellStyle, textAlign: "right", fontFamily: "monospace" }}>{fmtNum(g.loadedMi)}</td>
              <td style={{ ...cellStyle, textAlign: "right", fontFamily: "monospace", color: "var(--text-faint)" }}>{fmtNum(g.emptyMi)}</td>
              <td style={{ ...cellStyle, textAlign: "right", fontFamily: "monospace", color: g.deadheadPct > 25 ? "#dc2626" : g.deadheadPct > 15 ? "#d97706" : "#16a34a" }}>
                {g.deadheadPct.toFixed(1)}%
              </td>
              <td style={{ ...cellStyle, textAlign: "right", fontFamily: "monospace", fontWeight: 600, color: g.avgRpm >= 2.5 ? "#16a34a" : g.avgRpm >= 2.0 ? "#d97706" : "#dc2626" }}>
                {fmtRpm(g.avgRpm)}
              </td>
              <td style={{ ...cellStyle, textAlign: "right", fontWeight: 800, color: "#16a34a", fontFamily: "monospace" }}>
                {fmtMoney(g.gross)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ══════════════════════════════════════════════
   DRIVER / TRUCK DETAIL VIEW — week breakdown by day
══════════════════════════════════════════════ */
function DetailView({ title, subtitle, loads, weekKey, onBack, kind /* "driver" | "truck" */ }) {
  const range = weekRangeFromKey(weekKey);

  // Time-off tracking — only for drivers
  const { entries: timeOffEntries, subscribeForDriver, markTimeOff, removeTimeOff } = useTimeOffStore();
  useEffect(() => {
    if (kind === "driver" && title) {
      subscribeForDriver(title);
    }
    // intentionally no unsubscribe — store handles re-subscription
  }, [kind, title]);

  // Map of isoDay → time off entry for fast lookup
  const timeOffByDay = useMemo(() => {
    const m = {};
    for (const e of timeOffEntries) m[e.isoDay] = e;
    return m;
  }, [timeOffEntries]);

  // Stats: home days in last 30 / 60 days, and "days since last home"
  const homeStats = useMemo(() => {
    if (kind !== "driver") return null;
    const todayIso = new Date().toISOString().slice(0, 10);
    const day30 = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
    const day60 = new Date(Date.now() - 60 * 86400000).toISOString().slice(0, 10);
    let last30 = 0, last60 = 0;
    let mostRecent = null;
    for (const e of timeOffEntries) {
      if (e.isoDay >= day30 && e.isoDay <= todayIso) last30++;
      if (e.isoDay >= day60 && e.isoDay <= todayIso) last60++;
      if (e.isoDay <= todayIso && (!mostRecent || e.isoDay > mostRecent)) mostRecent = e.isoDay;
    }
    let daysSince = null;
    if (mostRecent) {
      const diff = Math.floor((new Date(todayIso) - new Date(mostRecent)) / 86400000);
      daysSince = diff;
    }
    return { last30, last60, daysSince, mostRecent };
  }, [timeOffEntries, kind]);

  async function handleDayClick(d) {
    if (kind !== "driver") return;
    const existing = timeOffByDay[d.isoDay];
    if (existing) {
      const ok = window.confirm(`Remove time off for ${d.isoDay}?${existing.note ? `\n\nNote: ${existing.note}` : ""}`);
      if (ok) await removeTimeOff(existing.id);
      return;
    }
    // Don't mark active days (driver had a load on this day) unless user really wants
    if (d.loadInfo.length > 0) {
      const ok = window.confirm(`This day has ${d.loadInfo.length} active load(s). Mark as time off anyway?`);
      if (!ok) return;
    }
    const note = window.prompt(`Mark ${d.isoDay} as time off.\n\nOptional note (e.g. "home time", "sick", "personal"):`, "home time");
    if (note === null) return; // cancelled
    await markTimeOff(title, d.isoDay, { type: "home", note });
  }

  // Build day-by-day map (Mon-Sun) — match loads as ACTIVE if pickup <= day <= delivery
  const days = useMemo(() => {
    if (!range) return [];
    const out = [];
    for (let i = 0; i < 7; i++) {
      const dayDate = new Date(range.monday.getTime() + i * 86400000);
      // Use UTC components — range.monday is UTC midnight of EST Monday
      const y = dayDate.getUTCFullYear();
      const mo = String(dayDate.getUTCMonth() + 1).padStart(2, "0");
      const d = String(dayDate.getUTCDate()).padStart(2, "0");
      const isoDay = `${y}-${mo}-${d}`;

      // Active loads: any load where pickup <= today <= delivery (inclusive)
      const loadInfo = loads
        .filter((l) => {
          const pu = String(l.puDate || "").slice(0, 10);
          if (!pu) return false;
          const del = String(l.delDate || "").slice(0, 10) || pu;
          return pu <= isoDay && isoDay <= del;
        })
        .map((l) => {
          const pu = String(l.puDate || "").slice(0, 10);
          const del = String(l.delDate || "").slice(0, 10) || pu;
          let phase;
          if (pu === del) phase = "sameday";
          else if (isoDay === pu) phase = "pickup";
          else if (isoDay === del) phase = "delivery";
          else phase = "transit";
          return { load: l, phase };
        });
      out.push({ date: dayDate, isoDay, loadInfo });
    }
    return out;
  }, [loads, weekKey]);

  const sortedLoads = useMemo(() => {
    return [...loads].sort((a, b) => String(a.puDate || "").localeCompare(String(b.puDate || "")));
  }, [loads]);

  const stats = useMemo(() => {
    const gross = loads.reduce((s, l) => s + (Number(l.rate) || 0), 0);
    const loaded = loads.reduce((s, l) => s + (Number(l.loadedMiles) || 0), 0);
    const empty = loads.reduce((s, l) => s + (Number(l.emptyMiles) || 0), 0);
    const totalMi = loaded + empty;
    return {
      count: loads.length,
      gross, loaded, empty,
      avgRpm: loaded > 0 ? gross / loaded : 0,
      deadheadPct: totalMi > 0 ? (empty / totalMi) * 100 : 0,
    };
  }, [loads]);

  // Track which trucks/drivers were used (for context)
  const associated = useMemo(() => {
    const set = new Set();
    for (const l of loads) {
      if (kind === "driver" && l.unit) set.add(l.unit);
      if (kind === "truck"  && l.driverName) set.add(l.driverName);
    }
    return [...set];
  }, [loads, kind]);

  const dayName = (d) => d.toLocaleDateString("en-US", { timeZone: "America/New_York", weekday: "short" });
  const dayDate = (d) => d.toLocaleDateString("en-US", { timeZone: "America/New_York", month: "short", day: "numeric" });

  const cellStyle = { padding: "10px 12px", borderBottom: "1px solid var(--border)", fontSize: 12, verticalAlign: "middle" };
  const headStyle = { padding: "10px 12px", fontSize: 10, fontWeight: 700, color: "var(--text-faint)", textTransform: "uppercase", letterSpacing: ".05em", textAlign: "left", borderBottom: "1px solid var(--border)", whiteSpace: "nowrap" };

  return (
    <div>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
        <button onClick={onBack} style={{
          background: "var(--bg-raised)", border: "1px solid var(--border)", borderRadius: 8,
          padding: "6px 12px", fontSize: 13, fontWeight: 600, cursor: "pointer", color: "var(--text-secondary)",
        }}>← Back</button>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 20, fontWeight: 800, color: "var(--text-primary)" }}>{title}</div>
          {subtitle && <div style={{ fontSize: 12, color: "var(--text-faint)", marginTop: 2 }}>{subtitle}</div>}
        </div>
        {kind === "driver" && homeStats && (
          <div style={{ fontSize: 11, color: "var(--text-faint)", textAlign: "right", lineHeight: 1.4, marginRight: 12 }}>
            <div>Home days last 30: <strong style={{ color: homeStats.last30 > 8 ? "#dc2626" : homeStats.last30 > 5 ? "#d97706" : "#16a34a" }}>{homeStats.last30}</strong></div>
            <div>Last home: <strong style={{ color: "var(--text-secondary)" }}>{
              homeStats.daysSince == null ? "never tracked" :
              homeStats.daysSince === 0 ? "today" :
              `${homeStats.daysSince}d ago`
            }</strong></div>
          </div>
        )}
        {associated.length > 0 && (
          <div style={{ fontSize: 11, color: "var(--text-faint)", textAlign: "right" }}>
            {kind === "driver" ? "Trucks used:" : "Drivers:"}<br />
            <span style={{ fontFamily: "monospace", color: "var(--text-secondary)", fontWeight: 600 }}>
              {associated.join(", ")}
            </span>
          </div>
        )}
      </div>

      {/* Stats */}
      <div style={{
        display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: 10,
        padding: "14px 18px", background: "var(--bg-surface)", border: "1px solid var(--border)",
        borderRadius: 12, marginBottom: 16,
      }}>
        {[
          { label: "Loads",      value: stats.count,                            color: "#2563eb" },
          { label: "Gross",      value: fmtMoney(stats.gross),                  color: "#16a34a" },
          { label: "Loaded mi",  value: fmtNum(stats.loaded),                   color: "#0891b2" },
          { label: "Empty mi",   value: fmtNum(stats.empty),                    color: "#d97706" },
          { label: "Avg RPM",    value: fmtRpm(stats.avgRpm),                   color: "#7c3aed" },
          { label: "Deadhead %", value: `${stats.deadheadPct.toFixed(1)}%`,     color: "#ea580c" },
        ].map((s) => (
          <div key={s.label}>
            <div style={{ fontSize: 10, fontWeight: 700, color: "var(--text-faint)", textTransform: "uppercase", letterSpacing: ".05em", marginBottom: 4 }}>{s.label}</div>
            <div style={{ fontSize: 19, fontWeight: 800, color: s.color, letterSpacing: "-0.5px" }}>{s.value}</div>
          </div>
        ))}
      </div>

      {/* Day-by-day timeline */}
      <div style={{ marginBottom: 18 }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text-faint)", textTransform: "uppercase", letterSpacing: ".05em", marginBottom: 8 }}>
          Week timeline
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 8 }}>
          {days.map((d) => {
            const hasActive = d.loadInfo.length > 0;
            const pickupsToday = d.loadInfo.filter((li) => li.phase === "pickup" || li.phase === "sameday");
            const transitToday = d.loadInfo.filter((li) => li.phase === "transit");
            const deliveriesToday = d.loadInfo.filter((li) => li.phase === "delivery");
            const dayGross = pickupsToday.reduce((s, li) => s + (Number(li.load.rate) || 0), 0);
            const offDay = timeOffByDay[d.isoDay];

            // Pick visual style based on state (priority: time off > active > no-load)
            let bg, border, label, labelColor;
            if (offDay) {
              bg = "#dbeafe"; border = "#93c5fd";
              label = "🏠 Home"; labelColor = "#1d4ed8";
            } else if (!hasActive) {
              bg = "#fef9f3"; border = "#fde7c2";
              label = "⚠ No load"; labelColor = "#92400e";
            } else if (pickupsToday.length > 0) {
              bg = "var(--bg-surface)"; border = "var(--border)";
            } else {
              bg = "#fef3c7"; border = "#fde68a";
              label = transitToday.length > 0 ? "🚛 In transit" : "📦 Delivery";
              labelColor = "#92400e";
            }

            const clickable = kind === "driver";

            return (
              <div key={d.isoDay}
                onClick={clickable ? () => handleDayClick(d) : undefined}
                title={clickable ? (offDay ? `Click to remove time off${offDay.note ? `\n\n${offDay.note}` : ""}` : "Click to mark as time off (home / sick / etc.)") : undefined}
                style={{
                  background: bg, border: `1px solid ${border}`,
                  borderRadius: 10, padding: "10px 12px", minHeight: 96,
                  cursor: clickable ? "pointer" : "default",
                  transition: "transform 100ms",
                }}
                onMouseEnter={clickable ? (e) => (e.currentTarget.style.transform = "translateY(-1px)") : undefined}
                onMouseLeave={clickable ? (e) => (e.currentTarget.style.transform = "translateY(0)") : undefined}
              >
                <div style={{ fontSize: 10, fontWeight: 700, color: "var(--text-faint)", textTransform: "uppercase" }}>{dayName(d.date)}</div>
                <div style={{ fontSize: 13, fontWeight: 700, color: "var(--text-primary)", marginBottom: 6 }}>{dayDate(d.date)}</div>
                {offDay ? (
                  <>
                    <div style={{ fontSize: 11, color: labelColor, fontWeight: 700 }}>{label}</div>
                    {offDay.note && (
                      <div style={{ fontSize: 10, color: "var(--text-muted)", marginTop: 3, lineHeight: 1.3, overflow: "hidden", textOverflow: "ellipsis", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" }}>
                        {offDay.note}
                      </div>
                    )}
                  </>
                ) : pickupsToday.length > 0 ? (
                  <>
                    <div style={{ fontSize: 11, fontWeight: 700, color: "#16a34a" }}>{fmtMoney(dayGross)}</div>
                    <div style={{ fontSize: 10, color: "var(--text-faint)", marginTop: 2 }}>
                      {pickupsToday.length} pickup{pickupsToday.length > 1 ? "s" : ""}
                      {deliveriesToday.length > 0 && ` · ${deliveriesToday.length} del`}
                    </div>
                  </>
                ) : (
                  <div style={{ fontSize: 11, color: labelColor, fontWeight: 600, marginTop: 6 }}>
                    {label}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Detailed table */}
      <div style={{ background: "var(--bg-surface)", border: "1px solid var(--border)", borderRadius: 12, overflow: "hidden" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ background: "var(--bg-hover)" }}>
              <th style={headStyle}>PU Date</th>
              <th style={headStyle}>Pick Up</th>
              <th style={headStyle}>Del Date</th>
              <th style={headStyle}>Delivery</th>
              {kind === "driver" && <th style={headStyle}>Truck</th>}
              {kind === "truck"  && <th style={headStyle}>Driver</th>}
              <th style={headStyle}>Broker</th>
              <th style={{ ...headStyle, textAlign: "right" }}>Loaded</th>
              <th style={{ ...headStyle, textAlign: "right" }}>Empty</th>
              <th style={{ ...headStyle, textAlign: "right" }}>RPM</th>
              <th style={{ ...headStyle, textAlign: "right" }}>Rate</th>
              <th style={headStyle}>Status</th>
            </tr>
          </thead>
          <tbody>
            {sortedLoads.map((l) => {
              const statusLower = String(l.status || "").toLowerCase();
              const isCancelled = statusLower.includes("cancel") || (Number(l.rate) || 0) === 0;
              return (
                <tr key={l.id} style={{ background: isCancelled ? "#fef2f2" : "transparent" }}>
                  <td style={{ ...cellStyle, fontWeight: 600, whiteSpace: "nowrap" }}>
                    {isCancelled && <span style={{ display: "inline-block", background: "#dc2626", color: "white", fontSize: 9, fontWeight: 800, padding: "1px 5px", borderRadius: 3, marginRight: 6, letterSpacing: ".04em" }}>CANCEL</span>}
                    {fmtDate(l.puDate)}
                  </td>
                  <td style={cellStyle}>{l.puCity ? `${l.puCity}, ${l.puState || ""}` : "—"}</td>
                  <td style={{ ...cellStyle, color: "var(--text-muted)", whiteSpace: "nowrap" }}>{fmtDate(l.delDate)}</td>
                  <td style={cellStyle}>{l.delCity ? `${l.delCity}, ${l.delState || ""}` : "—"}</td>
                  {kind === "driver" && <td style={{ ...cellStyle, fontFamily: "monospace", fontWeight: 700 }}>{l.unit || "—"}</td>}
                  {kind === "truck"  && <td style={cellStyle}>{l.driverName || "—"}</td>}
                  <td style={{ ...cellStyle, color: "var(--text-muted)" }}>{l.broker || "—"}</td>
                  <td style={{ ...cellStyle, textAlign: "right", fontFamily: "monospace" }}>{fmtNum(l.loadedMiles)}</td>
                  <td style={{ ...cellStyle, textAlign: "right", fontFamily: "monospace", color: l.emptyMiles > 0 && isCancelled ? "#dc2626" : "var(--text-faint)", fontWeight: l.emptyMiles > 0 && isCancelled ? 600 : 400 }}>{fmtNum(l.emptyMiles)}</td>
                  <td style={{ ...cellStyle, textAlign: "right", fontFamily: "monospace", fontWeight: 600 }}>{fmtRpm(l.rpm)}</td>
                  <td style={{ ...cellStyle, textAlign: "right", fontWeight: 700, color: isCancelled ? "#dc2626" : "#16a34a" }}>{fmtMoney(l.rate)}</td>
                  <td style={cellStyle}><StatusBadge status={l.status} /></td>
                </tr>
              );
            })}
            {/* Totals row */}
            <tr style={{ background: "#f0fdf4", fontWeight: 700 }}>
              <td style={cellStyle} colSpan={kind ? 6 : 5}>TOTAL</td>
              <td style={{ ...cellStyle, textAlign: "right", fontFamily: "monospace" }}>{fmtNum(stats.loaded)}</td>
              <td style={{ ...cellStyle, textAlign: "right", fontFamily: "monospace" }}>{fmtNum(stats.empty)}</td>
              <td style={{ ...cellStyle, textAlign: "right", fontFamily: "monospace" }}>{fmtRpm(stats.avgRpm)}</td>
              <td style={{ ...cellStyle, textAlign: "right", color: "#16a34a", fontFamily: "monospace" }}>{fmtMoney(stats.gross)}</td>
              <td style={cellStyle}></td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════
   MAIN VIEW
══════════════════════════════════════════════ */
export default function LoadsView() {
  const { loads, isLoading, syncError, subscribeLoads, unsubscribeLoads } = useLoadsStore();
  const { trucks } = useTrucksStore();
  const { drivers } = useDriversStore();

  // Initial state restored from localStorage (so refresh keeps the user where they were)
  const persisted = useRef(readPersistedState()).current;

  const [tab, setTab] = useState(persisted.tab || "week");      // "week" | "drivers" | "trucks"
  const [weekKey, setWeekKey] = useState(persisted.weekKey || currentWeekKey());
  const [selectedGroup, setSelectedGroup] = useState(null); // { kind, label, loads }
  // Pending restore: detail view state from localStorage, hydrated when loads arrive
  const [pendingRestore, setPendingRestore] = useState(persisted.selected || null);

  const [dispatcherFilter, setDispatcherFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [unitFilter, setUnitFilter] = useState("");
  const [search, setSearch] = useState("");

  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState(null);

  // Subscribe only to the current week — fast (50-100 docs vs 2800+)
  useEffect(() => {
    subscribeLoads(weekKey);
    // No cleanup — keep subscription alive for quick week navigation
  }, [weekKey]);

  // Reset detail selection when week or tab changes (but skip the initial mount)
  const isInitialMount = useRef(true);
  useEffect(() => {
    if (isInitialMount.current) {
      isInitialMount.current = false;
      return;
    }
    setSelectedGroup(null);
  }, [weekKey, tab]);

  // Persist user state — week, tab, selected group — to localStorage
  useEffect(() => {
    writePersistedState({
      weekKey, tab,
      selected: selectedGroup ? { kind: selectedGroup.kind, label: selectedGroup.label } : null,
    });
  }, [weekKey, tab, selectedGroup]);

  // Hydrate selectedGroup from persisted state once loads arrive
  useEffect(() => {
    if (!pendingRestore || loads.length === 0) return;
    const { kind, label } = pendingRestore;
    const groupLoads = loads.filter((l) => {
      if (kind === "driver") {
        const computedKey = l.driverName || `unit-${l.unit || "unknown"}`;
        return computedKey === label || l.driverName === label;
      }
      if (kind === "truck") return (l.unit || "(no unit)") === label;
      return false;
    });
    if (groupLoads.length > 0) {
      setSelectedGroup({ kind, label, loads: groupLoads });
    }
    setPendingRestore(null); // one-shot
  }, [pendingRestore, loads]);

  async function handleSync() {
    if (syncing) return;
    setSyncing(true);
    setSyncResult(null);
    try {
      if (!auth?.currentUser) throw new Error("Not signed in.");
      const idToken = await auth.currentUser.getIdToken();
      const res = await fetch(haulcarSyncEndpoint, {
        method: "POST",
        headers: { Authorization: `Bearer ${idToken}` },
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || `Sync failed (${res.status})`);
      setSyncResult(data);
    } catch (err) {
      setSyncResult({ error: String(err?.message || "Unknown error") });
    } finally {
      setSyncing(false);
    }
  }

  const range = weekRangeFromKey(weekKey);

  // Filter loads to current week + dispatcher/status/unit/search
  const filteredLoads = useMemo(() => {
    const q = search.trim().toLowerCase();
    return loads.filter((l) => {
      if (l.weekKey !== weekKey) return false;
      if (dispatcherFilter !== "all" && (l.dispatcher || "") !== dispatcherFilter) return false;
      if (statusFilter !== "all" && (l.status || "") !== statusFilter) return false;
      if (unitFilter && String(l.unit || "").toLowerCase().indexOf(unitFilter.toLowerCase()) < 0) return false;
      if (!q) return true;
      return (
        String(l.unit || "").toLowerCase().includes(q) ||
        String(l.broker || "").toLowerCase().includes(q) ||
        String(l.dispatcher || "").toLowerCase().includes(q) ||
        String(l.puCity || "").toLowerCase().includes(q) ||
        String(l.delCity || "").toLowerCase().includes(q)
      );
    });
  }, [loads, weekKey, dispatcherFilter, statusFilter, unitFilter, search]);

  const dispatchers = useMemo(() => {
    const set = new Set(loads.map((l) => l.dispatcher).filter(Boolean));
    return [...set].sort();
  }, [loads]);
  const statuses = useMemo(() => {
    const set = new Set(loads.map((l) => l.status).filter(Boolean));
    return [...set].sort();
  }, [loads]);

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", background: "var(--bg-app)", overflow: "hidden" }}>
      {/* Top bar */}
      <div style={{
        background: "var(--bg-surface)", borderBottom: "1px solid var(--border)",
        padding: "12px 20px", display: "flex", alignItems: "center", gap: 12, flexShrink: 0,
      }}>
        <div style={{ flexShrink: 0 }}>
          <div style={{ fontSize: 16, fontWeight: 800, color: "var(--text-primary)" }}>Loads</div>
          <div style={{ fontSize: 12, color: "var(--text-faint)", marginTop: 1 }}>
            {isLoading ? "Loading…" : `${loads.length} loads this week`} · Haulcar Pro
          </div>
        </div>

        {/* Week navigation */}
        <div style={{ display: "flex", alignItems: "center", gap: 6, marginLeft: 12 }}>
          <button onClick={() => setWeekKey(shiftWeekKey(weekKey, -1))}
            style={{ background: "var(--bg-raised)", border: "1px solid var(--border)", borderRadius: 8, width: 32, height: 32, fontSize: 14, cursor: "pointer", color: "var(--text-secondary)" }}
          >‹</button>
          <div style={{ minWidth: 200, textAlign: "center", padding: "6px 12px", background: "var(--bg-raised)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>
            {weekKey} · {range?.label}
          </div>
          <button onClick={() => setWeekKey(shiftWeekKey(weekKey, +1))}
            style={{ background: "var(--bg-raised)", border: "1px solid var(--border)", borderRadius: 8, width: 32, height: 32, fontSize: 14, cursor: "pointer", color: "var(--text-secondary)" }}
          >›</button>
          <button onClick={() => setWeekKey(currentWeekKey())}
            style={{ background: "var(--bg-raised)", border: "1px solid var(--border)", borderRadius: 8, padding: "6px 12px", fontSize: 12, fontWeight: 600, cursor: "pointer", color: "var(--text-secondary)", marginLeft: 4 }}
          >This week</button>
        </div>

        {/* Search */}
        <div style={{ position: "relative", flex: "0 0 220px", marginLeft: "auto" }}>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search unit, broker, city..."
            style={{ width: "100%", padding: "8px 12px", fontSize: 13, background: "var(--bg-raised)", border: "1px solid var(--border)", borderRadius: 9, color: "var(--text-primary)", outline: "none" }}
          />
        </div>

        <button
          onClick={handleSync}
          disabled={syncing}
          title="Pull latest loads from Haulcar Pro"
          style={{
            background: syncing ? "#eff6ff" : "var(--bg-raised)", border: "1px solid var(--border)", color: "var(--text-secondary)",
            padding: "8px 14px", borderRadius: 9, fontSize: 13, fontWeight: 600,
            cursor: syncing ? "wait" : "pointer", flexShrink: 0,
            display: "flex", alignItems: "center", gap: 6,
          }}
        >
          {syncing
            ? <span style={{ display: "inline-block", width: 12, height: 12, border: "2px solid #2563eb", borderTopColor: "transparent", borderRadius: "50%", animation: "spin .6s linear infinite" }} />
            : "📦"}
          Sync Loads
        </button>
      </div>

      {/* Tab + filter row */}
      <div style={{ display: "flex", gap: 0, padding: "0 20px", background: "var(--bg-surface)", borderBottom: "1px solid var(--border)", flexShrink: 0, alignItems: "center" }}>
        {[
          { id: "week",    label: "By Week",    icon: "📅" },
          { id: "drivers", label: "By Driver",  icon: "🚗" },
          { id: "trucks",  label: "By Truck",   icon: "🚛" },
        ].map((t) => (
          <button key={t.id}
            onClick={() => setTab(t.id)}
            style={{
              padding: "10px 16px", border: "none",
              borderBottom: tab === t.id ? "2px solid var(--color-primary)" : "2px solid transparent",
              background: "transparent", cursor: "pointer", fontSize: 13,
              fontWeight: tab === t.id ? 700 : 500,
              color: tab === t.id ? "var(--color-primary)" : "var(--text-muted)",
            }}
          >
            {t.icon} {t.label}
          </button>
        ))}

        <div style={{ marginLeft: "auto", display: "flex", gap: 8, alignItems: "center", padding: "6px 0" }}>
          <select value={dispatcherFilter} onChange={(e) => setDispatcherFilter(e.target.value)}
            style={{ padding: "6px 10px", fontSize: 12, fontWeight: 600, background: "var(--bg-raised)", border: "1px solid var(--border)", borderRadius: 8, color: "var(--text-secondary)", cursor: "pointer" }}
          >
            <option value="all">All dispatchers</option>
            {dispatchers.map((d) => <option key={d} value={d}>{d}</option>)}
          </select>
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}
            style={{ padding: "6px 10px", fontSize: 12, fontWeight: 600, background: "var(--bg-raised)", border: "1px solid var(--border)", borderRadius: 8, color: "var(--text-secondary)", cursor: "pointer" }}
          >
            <option value="all">All statuses</option>
            {statuses.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
          <input
            value={unitFilter}
            onChange={(e) => setUnitFilter(e.target.value)}
            placeholder="Unit #"
            style={{ width: 90, padding: "6px 10px", fontSize: 12, background: "var(--bg-raised)", border: "1px solid var(--border)", borderRadius: 8, color: "var(--text-primary)", outline: "none" }}
          />
        </div>
      </div>

      {/* Sync result banner */}
      {syncResult && (
        <div style={{
          padding: "10px 20px", fontSize: 12,
          background: syncResult.error ? "#fef2f2" : "#f0fdf4",
          color: syncResult.error ? "#dc2626" : "#15803d",
          borderBottom: `1px solid ${syncResult.error ? "#fecaca" : "#86efac"}`,
          display: "flex", alignItems: "center", justifyContent: "space-between",
        }}>
          <span>
            {syncResult.error
              ? <>⚠ {syncResult.error}</>
              : <>✅ Fetched {syncResult.fetched}{syncResult.apiTotal != null ? `/${syncResult.apiTotal}` : ""} loads · written {syncResult.report?.written} · skipped {syncResult.report?.skipped} · {syncResult.elapsedMs}ms</>}
          </span>
          <button onClick={() => setSyncResult(null)} style={{ background: "none", border: "none", color: "inherit", fontSize: 16, cursor: "pointer" }}>✕</button>
        </div>
      )}

      {/* Body */}
      <div style={{ flex: 1, overflowY: "auto", padding: 20 }}>
        {syncError && (
          <div style={{ background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 10, padding: "10px 14px", color: "#dc2626", fontSize: 13, marginBottom: 14 }}>
            ⚠ {syncError}
          </div>
        )}

        {isLoading && loads.length === 0 ? (
          <div style={{ textAlign: "center", padding: "60px 0", fontSize: 14, color: "var(--text-faint)" }}>
            Loading loads…
          </div>
        ) : (
          <>
            {selectedGroup ? (
              <DetailView
                title={selectedGroup.label}
                subtitle={`${range?.label || ""} · ${weekKey}`}
                loads={selectedGroup.loads}
                weekKey={weekKey}
                kind={selectedGroup.kind}
                onBack={() => setSelectedGroup(null)}
              />
            ) : (
              <>
                <StatsBar loads={filteredLoads} />
                {tab === "week"    && <LoadsTable loads={filteredLoads} />}
                {tab === "drivers" && <GroupTable loads={filteredLoads} groupBy="driver" trucks={trucks} drivers={drivers}
                  onRowClick={(g) => setSelectedGroup({ kind: "driver", label: g.label, loads: g.loads })} />}
                {tab === "trucks"  && <GroupTable loads={filteredLoads} groupBy="unit"   trucks={trucks} drivers={drivers}
                  onRowClick={(g) => setSelectedGroup({ kind: "truck",  label: g.label, loads: g.loads })} />}
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}
