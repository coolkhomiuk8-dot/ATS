import { useEffect, useMemo, useState } from "react";
import { useLoadsStore, weekRangeFromKey, currentWeekKey, shiftWeekKey } from "../store/useLoadsStore";
import { useTrucksStore } from "../store/useTrucksStore";

/* ───────────── helpers ───────────── */
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
function fmtPct(v) {
  const n = Number(v) || 0;
  return `${n.toFixed(1)}%`;
}

/**
 * Pick the Samsara mileage value matching the selected period from a truck doc.
 * Currently Samsara only stores today/thisWeek/thisMonth — for older weeks we
 * return null and show "—" in the UI.
 */
function actualMilesFor(truck, period) {
  const m = truck.mileage;
  if (!m) return null;
  if (period === "today") return Number(m.today) || 0;
  if (period === "thisWeek") return Number(m.thisWeek) || 0;
  if (period === "thisMonth") return Number(m.thisMonth) || 0;
  return null;
}

/* ───────────── main view ───────────── */
export default function ExpensesView() {
  const { loads, subscribeLoads } = useLoadsStore();
  const { trucks } = useTrucksStore();

  const [weekKey, setWeekKey] = useState(() => currentWeekKey());
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState("untrackedMi");
  const [sortDir, setSortDir] = useState("desc");

  useEffect(() => {
    subscribeLoads(weekKey);
  }, [weekKey]);

  const range = weekRangeFromKey(weekKey);
  const isCurrentWeek = weekKey === currentWeekKey();

  /* Build per-truck rows for the selected week */
  const rows = useMemo(() => {
    const out = [];
    for (const t of trucks) {
      if (!t.unitNumber) continue;
      const unitStr = String(t.unitNumber);
      const truckLoads = loads.filter((l) => String(l.unit || "") === unitStr && l.weekKey === weekKey);
      const loadedMi  = truckLoads.reduce((s, l) => s + (Number(l.loadedMiles) || 0), 0);
      const emptyMi   = truckLoads.reduce((s, l) => s + (Number(l.emptyMiles)  || 0), 0);
      const haulcarMi = loadedMi + emptyMi;
      const gross     = truckLoads.reduce((s, l) => s + (Number(l.rate) || 0), 0);

      // Actual miles only available for current week (Samsara stores rolling values)
      const actualMi = isCurrentWeek ? actualMilesFor(t, "thisWeek") : null;
      const untrackedMi = actualMi != null ? Math.max(0, actualMi - haulcarMi) : null;
      const untrackedPct = actualMi && actualMi > 0 && untrackedMi != null
        ? (untrackedMi / actualMi) * 100
        : null;

      const rpmActual = actualMi && actualMi > 0 ? gross / actualMi : null;
      const rpmLoaded = loadedMi > 0 ? gross / loadedMi : null;

      out.push({
        truckId: t.id,
        unit: unitStr,
        vin: t.vinNumber || "",
        driverName: t.assignedDriverName || "",
        loads: truckLoads.length,
        loadedMi, emptyMi, haulcarMi,
        actualMi, untrackedMi, untrackedPct,
        gross, rpmActual, rpmLoaded,
      });
    }
    return out;
  }, [trucks, loads, weekKey, isCurrentWeek]);

  /* Filter + sort */
  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    const filtered = q
      ? rows.filter((r) =>
          r.unit.toLowerCase().includes(q) ||
          r.vin.toLowerCase().includes(q) ||
          r.driverName.toLowerCase().includes(q),
        )
      : rows;
    const dir = sortDir === "asc" ? 1 : -1;
    return [...filtered].sort((a, b) => {
      const av = a[sortKey], bv = b[sortKey];
      // Nulls always last
      if (av == null && bv == null) return Number(a.unit) - Number(b.unit);
      if (av == null) return 1;
      if (bv == null) return -1;
      if (typeof av === "string") return av.localeCompare(bv) * dir;
      return (av - bv) * dir;
    });
  }, [rows, search, sortKey, sortDir]);

  function setSort(key) {
    if (sortKey === key) setSortDir(sortDir === "asc" ? "desc" : "asc");
    else { setSortKey(key); setSortDir("desc"); }
  }

  /* Totals for stats bar */
  const totals = useMemo(() => {
    return rows.reduce((acc, r) => {
      acc.loadedMi += r.loadedMi;
      acc.emptyMi  += r.emptyMi;
      acc.gross    += r.gross;
      if (r.actualMi != null)   acc.actualMi    += r.actualMi;
      if (r.untrackedMi != null) acc.untrackedMi += r.untrackedMi;
      acc.loads += r.loads;
      return acc;
    }, { loadedMi: 0, emptyMi: 0, actualMi: 0, untrackedMi: 0, gross: 0, loads: 0 });
  }, [rows]);
  const totalHaulcarMi = totals.loadedMi + totals.emptyMi;
  const fleetRpmActual = totals.actualMi > 0 ? totals.gross / totals.actualMi : null;
  const fleetUntrackedPct = totals.actualMi > 0 ? (totals.untrackedMi / totals.actualMi) * 100 : null;

  const headStyle = { padding: "10px 12px", fontSize: 10, fontWeight: 700, color: "var(--text-faint)", textTransform: "uppercase", letterSpacing: ".05em", textAlign: "left", borderBottom: "1px solid var(--border)", whiteSpace: "nowrap", cursor: "pointer", userSelect: "none" };
  const cellStyle = { padding: "10px 12px", borderBottom: "1px solid var(--border)", fontSize: 12, verticalAlign: "middle" };

  const SortArrow = ({ k }) => sortKey === k
    ? <span style={{ marginLeft: 4, color: "#2563eb" }}>{sortDir === "asc" ? "↑" : "↓"}</span>
    : null;

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", background: "var(--bg-app)", overflow: "hidden" }}>
      {/* Top bar */}
      <div style={{
        background: "var(--bg-surface)", borderBottom: "1px solid var(--border)",
        padding: "12px 20px", display: "flex", alignItems: "center", gap: 12, flexShrink: 0,
      }}>
        <div style={{ flexShrink: 0 }}>
          <div style={{ fontSize: 16, fontWeight: 800, color: "var(--text-primary)" }}>Expenses</div>
          <div style={{ fontSize: 12, color: "var(--text-faint)", marginTop: 1 }}>
            actual miles vs loads — looking for leaks
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

        <div style={{ position: "relative", flex: "0 0 220px", marginLeft: "auto" }}>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search unit / VIN / driver..."
            style={{ width: "100%", padding: "8px 12px", fontSize: 13, background: "var(--bg-raised)", border: "1px solid var(--border)", borderRadius: 9, color: "var(--text-primary)", outline: "none" }}
          />
        </div>
      </div>

      {/* Body */}
      <div style={{ flex: 1, overflowY: "auto", padding: 20 }}>
        {/* Warning for historical weeks */}
        {!isCurrentWeek && (
          <div style={{
            background: "#fffbeb", border: "1px solid #fde68a", color: "#92400e",
            borderRadius: 10, padding: "10px 14px", fontSize: 12, marginBottom: 14,
          }}>
            ⚠ Actual miles (Samsara) only available for the current week. For past weeks the
            comparison is incomplete — only Haulcar-side data is shown.
          </div>
        )}

        {/* Fleet stats bar */}
        <div style={{
          display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: 10,
          padding: "12px 16px", background: "var(--bg-surface)",
          border: "1px solid var(--border)", borderRadius: 12, marginBottom: 14,
        }}>
          {[
            { label: "Active trucks", value: rows.filter((r) => r.loads > 0 || (r.actualMi && r.actualMi > 0)).length, color: "#2563eb" },
            { label: "Gross",         value: fmtMoney(totals.gross),                   color: "#16a34a" },
            { label: "Loaded mi",     value: fmtNum(totals.loadedMi),                  color: "#0891b2" },
            { label: "Actual mi",     value: isCurrentWeek ? fmtNum(totals.actualMi) : "—", color: "#7c3aed" },
            { label: "Untracked mi",  value: isCurrentWeek ? fmtNum(totals.untrackedMi) : "—", color: "#dc2626" },
            { label: "$/actual mi",   value: fleetRpmActual != null ? fmtRpm(fleetRpmActual) : "—", color: "#ea580c" },
          ].map((s) => (
            <div key={s.label}>
              <div style={{ fontSize: 10, fontWeight: 700, color: "var(--text-faint)", textTransform: "uppercase", letterSpacing: ".05em", marginBottom: 3 }}>{s.label}</div>
              <div style={{ fontSize: 18, fontWeight: 800, color: s.color, letterSpacing: "-0.5px" }}>{s.value}</div>
            </div>
          ))}
        </div>

        {/* Untracked-miles highlight banner */}
        {isCurrentWeek && fleetUntrackedPct != null && fleetUntrackedPct > 5 && (
          <div style={{
            background: "#fef2f2", border: "1px solid #fecaca",
            borderRadius: 10, padding: "10px 14px", fontSize: 13, marginBottom: 14,
            color: "#991b1b", fontWeight: 600,
          }}>
            🚨 Fleet-wide untracked mileage: {fmtNum(totals.untrackedMi)} mi ({fmtPct(fleetUntrackedPct)} of actual).
            Trucks have driven this far beyond what their loads account for.
          </div>
        )}

        {/* Per-truck table */}
        <div style={{ background: "var(--bg-surface)", border: "1px solid var(--border)", borderRadius: 12, overflow: "hidden" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ background: "var(--bg-hover)" }}>
                <th style={headStyle} onClick={() => setSort("unit")}>Unit<SortArrow k="unit" /></th>
                <th style={headStyle}>Driver</th>
                <th style={{ ...headStyle, textAlign: "right" }} onClick={() => setSort("loads")}>Loads<SortArrow k="loads" /></th>
                <th style={{ ...headStyle, textAlign: "right" }} onClick={() => setSort("loadedMi")}>Loaded mi<SortArrow k="loadedMi" /></th>
                <th style={{ ...headStyle, textAlign: "right" }} onClick={() => setSort("emptyMi")}>Empty mi<SortArrow k="emptyMi" /></th>
                <th style={{ ...headStyle, textAlign: "right" }} onClick={() => setSort("actualMi")}>Actual mi<SortArrow k="actualMi" /></th>
                <th style={{ ...headStyle, textAlign: "right" }} onClick={() => setSort("untrackedMi")}>Untracked<SortArrow k="untrackedMi" /></th>
                <th style={{ ...headStyle, textAlign: "right" }} onClick={() => setSort("untrackedPct")}>Untracked %<SortArrow k="untrackedPct" /></th>
                <th style={{ ...headStyle, textAlign: "right" }} onClick={() => setSort("gross")}>Gross<SortArrow k="gross" /></th>
                <th style={{ ...headStyle, textAlign: "right" }} onClick={() => setSort("rpmActual")}>$/actual mi<SortArrow k="rpmActual" /></th>
              </tr>
            </thead>
            <tbody>
              {visible.map((r) => {
                const untrackedColor = r.untrackedPct == null ? "var(--text-faint)"
                  : r.untrackedPct > 20 ? "#dc2626"
                  : r.untrackedPct > 10 ? "#d97706"
                  : "#16a34a";
                const rowBg = r.untrackedPct != null && r.untrackedPct > 25 ? "#fef2f2" : "transparent";
                return (
                  <tr key={r.truckId} style={{ background: rowBg }}>
                    <td style={{ ...cellStyle, fontWeight: 800, fontFamily: "monospace", color: "var(--text-primary)" }}>{r.unit}</td>
                    <td style={{ ...cellStyle, color: "var(--text-secondary)" }}>{r.driverName || "—"}</td>
                    <td style={{ ...cellStyle, textAlign: "right", fontFamily: "monospace" }}>{r.loads || "—"}</td>
                    <td style={{ ...cellStyle, textAlign: "right", fontFamily: "monospace" }}>{r.loadedMi ? fmtNum(r.loadedMi) : "—"}</td>
                    <td style={{ ...cellStyle, textAlign: "right", fontFamily: "monospace", color: "var(--text-faint)" }}>{r.emptyMi ? fmtNum(r.emptyMi) : "—"}</td>
                    <td style={{ ...cellStyle, textAlign: "right", fontFamily: "monospace", fontWeight: 600 }}>{r.actualMi != null ? fmtNum(r.actualMi) : "—"}</td>
                    <td style={{ ...cellStyle, textAlign: "right", fontFamily: "monospace", color: untrackedColor, fontWeight: 700 }}>{r.untrackedMi != null ? fmtNum(r.untrackedMi) : "—"}</td>
                    <td style={{ ...cellStyle, textAlign: "right", fontFamily: "monospace", color: untrackedColor, fontWeight: 700 }}>{r.untrackedPct != null ? fmtPct(r.untrackedPct) : "—"}</td>
                    <td style={{ ...cellStyle, textAlign: "right", fontWeight: 700, color: "#16a34a", fontFamily: "monospace" }}>{r.gross ? fmtMoney(r.gross) : "—"}</td>
                    <td style={{ ...cellStyle, textAlign: "right", fontFamily: "monospace", fontWeight: 600, color: r.rpmActual == null ? "var(--text-faint)" : r.rpmActual >= 2.0 ? "#16a34a" : r.rpmActual >= 1.5 ? "#d97706" : "#dc2626" }}>{r.rpmActual != null ? fmtRpm(r.rpmActual) : "—"}</td>
                  </tr>
                );
              })}
              {visible.length === 0 && (
                <tr><td colSpan={10} style={{ ...cellStyle, textAlign: "center", padding: 40, color: "var(--text-faint)" }}>No trucks match.</td></tr>
              )}
              {/* Totals row */}
              {visible.length > 0 && (
                <tr style={{ background: "#f0fdf4", fontWeight: 700 }}>
                  <td style={cellStyle} colSpan={3}>FLEET TOTAL</td>
                  <td style={{ ...cellStyle, textAlign: "right", fontFamily: "monospace" }}>{fmtNum(totals.loadedMi)}</td>
                  <td style={{ ...cellStyle, textAlign: "right", fontFamily: "monospace" }}>{fmtNum(totals.emptyMi)}</td>
                  <td style={{ ...cellStyle, textAlign: "right", fontFamily: "monospace" }}>{isCurrentWeek ? fmtNum(totals.actualMi) : "—"}</td>
                  <td style={{ ...cellStyle, textAlign: "right", fontFamily: "monospace", color: "#dc2626" }}>{isCurrentWeek ? fmtNum(totals.untrackedMi) : "—"}</td>
                  <td style={{ ...cellStyle, textAlign: "right", fontFamily: "monospace", color: "#dc2626" }}>{fleetUntrackedPct != null ? fmtPct(fleetUntrackedPct) : "—"}</td>
                  <td style={{ ...cellStyle, textAlign: "right", color: "#16a34a", fontFamily: "monospace" }}>{fmtMoney(totals.gross)}</td>
                  <td style={{ ...cellStyle, textAlign: "right", fontFamily: "monospace" }}>{fleetRpmActual != null ? fmtRpm(fleetRpmActual) : "—"}</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
