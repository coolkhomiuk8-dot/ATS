import { useState, useMemo } from "react";
import { useDriversStore } from "../store/useDriversStore";
import { useTrucksStore } from "../store/useTrucksStore";
import { STAGES } from "../constants/data";
import { expiryStatus, tenureLabel } from "../utils/date";

/* ── helpers ── */
function StageBadge({ stageId }) {
  const s = STAGES.find((x) => x.id === stageId);
  if (!s) return null;
  return (
    <span style={{
      fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 20,
      background: s.light, color: s.color, border: `1px solid ${s.color}33`, whiteSpace: "nowrap",
    }}>{s.label}</span>
  );
}

function fmtRate(val) {
  const n = parseFloat(val);
  return isNaN(n) || n === 0 ? null : `$${n.toFixed(2)}`;
}

/* ── Add Driver Modal (simple, fleet-oriented) ── */
function AddDriverModal({ onClose, onAdd, drivers }) {
  const [form, setForm] = useState({
    name: "", phone: "", email: "",
    emptyMilesRate: "", loadedMilesRate: "",
    enabled: true,
    stage: "hired",
    hireDate: "", dlExpiry: "",
  });
  const [emergencyContacts, setEmergencyContacts] = useState([{ name: "", phone: "" }]);
  const [dupDriver, setDupDriver] = useState(null);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState({});

  function setF(k, v) { setForm((p) => ({ ...p, [k]: v })); setDupDriver(null); setErrors((p) => ({ ...p, [k]: false })); }

  function setEC(idx, key, val) {
    setEmergencyContacts((prev) => prev.map((c, i) => i === idx ? { ...c, [key]: val } : c));
    setErrors((p) => ({ ...p, [`ec_${idx}_${key}`]: false }));
  }
  function addEC() { setEmergencyContacts((prev) => [...prev, { name: "", phone: "" }]); }
  function removeEC(idx) { setEmergencyContacts((prev) => prev.filter((_, i) => i !== idx)); }

  const inputStyle = {
    width: "100%", padding: "9px 11px", fontSize: 13,
    background: "var(--bg-raised)", border: "1px solid var(--border)",
    borderRadius: 8, color: "var(--text-primary)", outline: "none", boxSizing: "border-box",
  };
  const errStyle = { ...inputStyle, border: "1.5px solid #fca5a5" };
  const labelStyle = { fontSize: 11, color: "var(--text-faint)", marginBottom: 4, fontWeight: 600 };

  function validate() {
    const e = {};
    if (!form.name.trim())           e.name = true;
    if (!form.phone.trim())          e.phone = true;
    if (!form.email.trim())          e.email = true;
    if (!form.emptyMilesRate || parseFloat(form.emptyMilesRate) <= 0)  e.emptyMilesRate = true;
    if (!form.loadedMilesRate || parseFloat(form.loadedMilesRate) <= 0) e.loadedMilesRate = true;
    if (!form.hireDate)              e.hireDate = true;
    if (!form.dlExpiry)              e.dlExpiry = true;
    emergencyContacts.forEach((c, i) => {
      if (!c.name.trim())  e[`ec_${i}_name`] = true;
      if (!c.phone.trim()) e[`ec_${i}_phone`] = true;
    });
    return e;
  }

  async function handleSave() {
    const e = validate();
    if (Object.keys(e).length > 0) { setErrors(e); return; }

    const normalized = form.phone.replace(/\D/g, "");
    const dup = normalized.length >= 7
      ? (drivers || []).find((d) => (d.phone || "").replace(/\D/g, "") === normalized)
      : null;
    if (dup) { setDupDriver(dup); return; }

    setSaving(true);
    try {
      await onAdd({
        name: form.name.trim(),
        phone: form.phone.trim(),
        email: form.email.trim(),
        emptyMilesRate: parseFloat(form.emptyMilesRate) || 0,
        loadedMilesRate: parseFloat(form.loadedMilesRate) || 0,
        enabled: form.enabled,
        stage: form.stage,
        hireDate: form.hireDate,
        dlExpiry: form.dlExpiry,
        emergencyContacts: emergencyContacts.map((c) => ({ name: c.name.trim(), phone: c.phone.trim() })),
        source: "Direct",
        createdAt: new Date().toISOString().split("T")[0],
      });
      onClose();
    } finally {
      setSaving(false);
    }
  }

  const canSave = !saving;

  return (
    <div
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,.5)", zIndex: 500, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}
    >
      <div onClick={(e) => e.stopPropagation()} style={{
        background: "var(--bg-surface)", borderRadius: 16, width: "100%", maxWidth: 460,
        padding: 26, boxShadow: "0 20px 60px rgba(0,0,0,.25)", maxHeight: "90vh", overflowY: "auto",
      }}>
        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
          <div>
            <div style={{ fontSize: 18, fontWeight: 800, color: "var(--text-primary)" }}>Add Driver</div>
            <div style={{ fontSize: 12, color: "var(--text-faint)", marginTop: 2 }}>Direct hire — bypasses recruitment funnel</div>
          </div>
          <button onClick={onClose} style={{ background: "var(--bg-raised)", border: "1px solid var(--border)", borderRadius: 8, width: 32, height: 32, cursor: "pointer", color: "var(--text-muted)", fontSize: 15, display: "flex", alignItems: "center", justifyContent: "center" }}>×</button>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {/* Name */}
          <div>
            <div style={labelStyle}>Name *</div>
            <input value={form.name} onChange={(e) => setF("name", e.target.value)} placeholder="James Miller" style={errors.name ? errStyle : inputStyle} />
          </div>

          {/* Phone + Email */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <div>
              <div style={labelStyle}>Phone *</div>
              <input value={form.phone} onChange={(e) => setF("phone", e.target.value)} placeholder="(999) 999-9999" style={errors.phone ? errStyle : inputStyle} />
            </div>
            <div>
              <div style={labelStyle}>Email *</div>
              <input value={form.email} onChange={(e) => setF("email", e.target.value)} placeholder="driver@email.com" style={errors.email ? errStyle : inputStyle} />
            </div>
          </div>

          {/* Rates */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <div>
              <div style={labelStyle}>Empty miles rate *</div>
              <div style={{ position: "relative" }}>
                <span style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: "var(--text-faint)", fontSize: 13 }}>$</span>
                <input type="number" step="0.01" min="0" value={form.emptyMilesRate} onChange={(e) => setF("emptyMilesRate", e.target.value)} placeholder="0.55" style={{ ...(errors.emptyMilesRate ? errStyle : inputStyle), paddingLeft: 22 }} />
              </div>
            </div>
            <div>
              <div style={labelStyle}>Loaded miles rate *</div>
              <div style={{ position: "relative" }}>
                <span style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: "var(--text-faint)", fontSize: 13 }}>$</span>
                <input type="number" step="0.01" min="0" value={form.loadedMilesRate} onChange={(e) => setF("loadedMilesRate", e.target.value)} placeholder="0.75" style={{ ...(errors.loadedMilesRate ? errStyle : inputStyle), paddingLeft: 22 }} />
              </div>
            </div>
          </div>

          {/* Hire Date + DL Expiry */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <div>
              <div style={labelStyle}>Hire Date *</div>
              <input type="date" value={form.hireDate} onChange={(e) => setF("hireDate", e.target.value)} style={errors.hireDate ? errStyle : inputStyle} />
            </div>
            <div>
              <div style={labelStyle}>DL Expiry *</div>
              <input type="date" value={form.dlExpiry} onChange={(e) => setF("dlExpiry", e.target.value)} style={errors.dlExpiry ? errStyle : inputStyle} />
            </div>
          </div>

          {/* Enabled toggle */}
          <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 12px", background: "var(--bg-raised)", borderRadius: 9, border: "1px solid var(--border)" }}>
            <div
              onClick={() => setF("enabled", !form.enabled)}
              style={{
                width: 42, height: 24, borderRadius: 12, cursor: "pointer",
                background: form.enabled ? "#16a34a" : "var(--text-disabled)",
                position: "relative", transition: "background .2s", flexShrink: 0,
              }}
            >
              <div style={{
                position: "absolute", top: 3, left: form.enabled ? 21 : 3,
                width: 18, height: 18, borderRadius: "50%", background: "#fff",
                transition: "left .2s", boxShadow: "0 1px 4px rgba(0,0,0,.2)",
              }} />
            </div>
            <span style={{ fontSize: 13, fontWeight: 600, color: form.enabled ? "#15803d" : "var(--text-muted)" }}>
              {form.enabled ? "Enabled — driver is active" : "Disabled — driver inactive"}
            </span>
          </div>

          {/* Emergency Contacts */}
          <div style={{ borderTop: "1px solid var(--border)", paddingTop: 14 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 700, color: "var(--text-primary)" }}>Emergency Contacts *</div>
                <div style={{ fontSize: 11, color: "var(--text-faint)", marginTop: 2 }}>At least 1 required</div>
              </div>
              <button
                onClick={addEC}
                style={{ padding: "5px 12px", background: "var(--bg-raised)", border: "1px solid var(--border)", borderRadius: 7, fontSize: 12, fontWeight: 600, color: "var(--color-primary)", cursor: "pointer" }}
              >
                + Add
              </button>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {emergencyContacts.map((c, i) => (
                <div key={i} style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
                  <div style={{ flex: 1, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                    <div>
                      {i === 0 && <div style={{ ...labelStyle, marginBottom: 4 }}>Name *</div>}
                      <input
                        value={c.name}
                        onChange={(e) => setEC(i, "name", e.target.value)}
                        placeholder="John Miller"
                        style={errors[`ec_${i}_name`] ? errStyle : inputStyle}
                      />
                    </div>
                    <div>
                      {i === 0 && <div style={{ ...labelStyle, marginBottom: 4 }}>Phone *</div>}
                      <input
                        value={c.phone}
                        onChange={(e) => setEC(i, "phone", e.target.value)}
                        placeholder="(999) 999-9999"
                        style={errors[`ec_${i}_phone`] ? errStyle : inputStyle}
                      />
                    </div>
                  </div>
                  {emergencyContacts.length > 1 && (
                    <button
                      onClick={() => removeEC(i)}
                      style={{
                        marginTop: i === 0 ? 20 : 0,
                        width: 32, height: 38, flexShrink: 0,
                        background: "#fef2f2", border: "1px solid #fecaca",
                        borderRadius: 7, cursor: "pointer", color: "#dc2626", fontSize: 15,
                        display: "flex", alignItems: "center", justifyContent: "center",
                      }}
                    >×</button>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Duplicate warning */}
          {dupDriver && (
            <div style={{ background: "#fef2f2", border: "1.5px solid #fecaca", borderRadius: 9, padding: "10px 12px", fontSize: 13, color: "#dc2626" }}>
              ⚠️ Driver with this phone already exists: <strong>{dupDriver.name}</strong> · {dupDriver.stage}
            </div>
          )}

          {/* Validation error hint */}
          {Object.keys(errors).length > 0 && (
            <div style={{ background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 8, padding: "8px 12px", fontSize: 12, color: "#dc2626" }}>
              ⚠ Please fill in all required fields marked in red
            </div>
          )}

          {/* Actions */}
          <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
            <button
              onClick={handleSave}
              disabled={!canSave}
              style={{
                flex: 1, padding: "11px",
                background: canSave ? "var(--color-primary)" : "var(--text-disabled)",
                color: "#fff", border: "none", borderRadius: 9, fontSize: 14, fontWeight: 700,
                cursor: canSave ? "pointer" : "default",
              }}
            >
              {saving ? "Saving…" : "Save"}
            </button>
            <button onClick={onClose} style={{ padding: "11px 18px", background: "var(--bg-raised)", color: "var(--text-muted)", border: "1px solid var(--border)", borderRadius: 9, fontSize: 13, cursor: "pointer" }}>
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── Driver Row ── */
function DriverRow({ driver, truck, onClick }) {
  const exp = expiryStatus(driver.dlExpiry);
  const tenure = tenureLabel(driver.hireDate);
  const ins = driver.insuranceCompanies || [];
  const emptyRate = fmtRate(driver.emptyMilesRate);
  const loadedRate = fmtRate(driver.loadedMilesRate);

  return (
    <div
      onClick={onClick}
      style={{
        background: "var(--bg-surface)", border: "1px solid var(--border)",
        borderRadius: 10, padding: "11px 16px", cursor: "pointer",
        display: "flex", alignItems: "center", gap: 0, transition: "all .15s",
      }}
      onMouseEnter={(e) => { e.currentTarget.style.borderColor = "var(--color-primary)"; e.currentTarget.style.boxShadow = "0 2px 12px rgba(37,99,235,.08)"; }}
      onMouseLeave={(e) => { e.currentTarget.style.borderColor = "var(--border)"; e.currentTarget.style.boxShadow = "none"; }}
    >
      {/* Col 1 — Name + stage */}
      <div style={{ minWidth: 200, flexShrink: 0, paddingRight: 14, borderRight: "1px solid var(--border)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 3 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: driver.enabled === false ? "var(--text-faint)" : "var(--text-primary)" }}>
            {driver.name || "—"}
          </div>
          {driver.enabled === false && (
            <span style={{ fontSize: 9, fontWeight: 700, padding: "1px 5px", borderRadius: 3, background: "#f1f5f9", color: "#64748b", border: "1px solid #cbd5e1" }}>OFF</span>
          )}
        </div>
        <div style={{ fontSize: 11, color: "var(--text-faint)", marginBottom: 5 }}>{driver.phone}</div>
        <StageBadge stageId={driver.stage} />
      </div>

      {/* Col 2 — Truck */}
      <div style={{ minWidth: 110, flexShrink: 0, padding: "0 14px", borderRight: "1px solid var(--border)" }}>
        <div style={{ fontSize: 9, fontWeight: 700, color: "var(--text-faint)", textTransform: "uppercase", letterSpacing: ".05em", marginBottom: 4 }}>Truck</div>
        {truck ? (
          <span style={{ fontSize: 12, fontWeight: 700, color: "var(--color-primary-dark)" }}>🚛 Unit {truck.unitNumber}</span>
        ) : (
          <span style={{ fontSize: 11, color: "var(--text-disabled)" }}>—</span>
        )}
      </div>

      {/* Col 3 — Insurance */}
      <div style={{ minWidth: 150, flexShrink: 0, padding: "0 14px", borderRight: "1px solid var(--border)", display: "flex", flexDirection: "column", gap: 3 }}>
        <div style={{ fontSize: 9, fontWeight: 700, color: "var(--text-faint)", textTransform: "uppercase", letterSpacing: ".05em", marginBottom: 2 }}>Insurance</div>
        {ins.length === 0
          ? <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 6px", borderRadius: 4, background: "#fef2f2", color: "#dc2626", border: "1px solid #fecaca", alignSelf: "flex-start" }}>⚠ Not set</span>
          : ins.map((c) => (
              <span key={c} style={{ fontSize: 10, fontWeight: 700, padding: "2px 6px", borderRadius: 4, background: "#f0fdf4", color: "#15803d", border: "1px solid #86efac", whiteSpace: "nowrap", alignSelf: "flex-start" }}>✓ {c}</span>
            ))
        }
      </div>

      {/* Col 4 — DL Expiry */}
      <div style={{ minWidth: 130, flexShrink: 0, padding: "0 14px", borderRight: "1px solid var(--border)" }}>
        <div style={{ fontSize: 9, fontWeight: 700, color: "var(--text-faint)", textTransform: "uppercase", letterSpacing: ".05em", marginBottom: 4 }}>DL Expiry</div>
        {driver.dlExpiry && exp ? (
          <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 7px", borderRadius: 20, background: exp.color + "18", color: exp.color, border: `1px solid ${exp.border}` }}>
            {exp.label}
          </span>
        ) : (
          <span style={{ fontSize: 11, color: "var(--text-disabled)" }}>Not set</span>
        )}
      </div>

      {/* Col 5 — Rates */}
      <div style={{ minWidth: 130, flexShrink: 0, padding: "0 14px", borderRight: "1px solid var(--border)" }}>
        <div style={{ fontSize: 9, fontWeight: 700, color: "var(--text-faint)", textTransform: "uppercase", letterSpacing: ".05em", marginBottom: 4 }}>Pay rates</div>
        {(emptyRate || loadedRate) ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
            {emptyRate && <span style={{ fontSize: 10, color: "var(--text-secondary)" }}>Empty: <strong>{emptyRate}</strong></span>}
            {loadedRate && <span style={{ fontSize: 10, color: "var(--text-secondary)" }}>Loaded: <strong>{loadedRate}</strong></span>}
          </div>
        ) : (
          <span style={{ fontSize: 11, color: "var(--text-disabled)" }}>—</span>
        )}
      </div>

      {/* Col 6 — Tenure + city */}
      <div style={{ flex: 1, padding: "0 0 0 14px" }}>
        <div style={{ fontSize: 9, fontWeight: 700, color: "var(--text-faint)", textTransform: "uppercase", letterSpacing: ".05em", marginBottom: 4 }}>With us</div>
        {tenure
          ? <div style={{ fontSize: 11, fontWeight: 600, color: "#1d4ed8" }}>🗓 {tenure}</div>
          : <div style={{ fontSize: 11, color: "var(--text-disabled)" }}>—</div>
        }
        {driver.city && <div style={{ fontSize: 10, color: "var(--text-faint)", marginTop: 3 }}>📍 {driver.city}</div>}
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════
   DRIVERS VIEW
══════════════════════════════════════════ */
export default function DriversView({ onSelectDriver }) {
  const { drivers, addDriver } = useDriversStore();
  const { trucks } = useTrucksStore();

  const [search, setSearch] = useState("");
  const [showAdd, setShowAdd] = useState(false);

  // driverId → assigned truck
  const driverToTruck = useMemo(() => {
    const map = {};
    trucks.forEach((t) => { if (t.assignedDriverId) map[t.assignedDriverId] = t; });
    return map;
  }, [trucks]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return drivers
      .filter((d) => d.stage === "hired")
      .filter((d) => {
        if (!q) return true;
        return (
          (d.name || "").toLowerCase().includes(q) ||
          (d.phone || "").includes(q) ||
          (d.email || "").toLowerCase().includes(q) ||
          (d.city || "").toLowerCase().includes(q)
        );
      })
      .sort((a, b) => (a.name || "").localeCompare(b.name || ""));
  }, [drivers, search]);

  // Stats
  const hired = drivers.filter((d) => d.stage === "hired");
  const enabledCount = hired.filter((d) => d.enabled !== false).length;
  const disabledCount = hired.filter((d) => d.enabled === false).length;

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", background: "var(--bg-app)", overflow: "hidden" }}>

      {/* Top bar */}
      <div style={{
        background: "var(--bg-surface)", borderBottom: "1px solid var(--border)",
        padding: "12px 20px", display: "flex", alignItems: "center", gap: 12, flexShrink: 0,
      }}>
        <div style={{ flexShrink: 0 }}>
          <div style={{ fontSize: 16, fontWeight: 800, color: "var(--text-primary)" }}>Drivers</div>
          <div style={{ fontSize: 12, color: "var(--text-faint)", marginTop: 1 }}>Hired only</div>
        </div>

        {/* Stats pills */}
        <div style={{ display: "flex", gap: 6 }}>
          {[
            { label: "Hired",    count: hired.length,   color: "#16a34a", bg: "#f0fdf4" },
            { label: "Enabled",  count: enabledCount,   color: "#2563eb", bg: "#eff6ff" },
            { label: "Disabled", count: disabledCount,  color: "#94a3b8", bg: "#f1f5f9" },
          ].map((s) => (
            <span key={s.label} style={{
              fontSize: 12, fontWeight: 700, padding: "4px 10px", borderRadius: 20,
              background: s.bg, color: s.color, border: `1px solid ${s.color}33`,
            }}>
              {s.count} {s.label}
            </span>
          ))}
        </div>

        {/* Search */}
        <div style={{ position: "relative", flex: "0 0 240px", marginLeft: "auto" }}>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search name, phone, city…"
            style={{
              width: "100%", padding: "8px 28px 8px 12px", fontSize: 13,
              background: "var(--bg-raised)", border: "1px solid var(--border)",
              borderRadius: 9, color: "var(--text-primary)", outline: "none",
            }}
          />
          {search && (
            <button onClick={() => setSearch("")} style={{ position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", color: "var(--text-faint)", fontSize: 14, cursor: "pointer", padding: 0 }}>×</button>
          )}
        </div>

        {/* Add Driver */}
        <button
          onClick={() => setShowAdd(true)}
          style={{
            background: "var(--color-primary)", border: "none", color: "#fff",
            padding: "9px 18px", borderRadius: 9, fontSize: 13, fontWeight: 600,
            cursor: "pointer", flexShrink: 0,
          }}
        >
          + Add Driver
        </button>
      </div>

      {/* List */}
      <div style={{ flex: 1, overflowY: "auto", padding: 20 }}>
        {filtered.length === 0 ? (
          <div style={{ textAlign: "center", padding: "60px 0", fontSize: 14, color: "var(--text-faint)" }}>
            {hired.length === 0
              ? "No hired drivers yet — click + Add Driver to get started."
              : "No drivers match your search."}
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {filtered.map((driver) => (
              <DriverRow
                key={driver.id}
                driver={driver}
                truck={driverToTruck[driver.id] || null}
                onClick={() => onSelectDriver(driver.id)}
              />
            ))}
          </div>
        )}
      </div>

      {/* Add Driver Modal */}
      {showAdd && (
        <AddDriverModal
          drivers={drivers}
          onClose={() => setShowAdd(false)}
          onAdd={addDriver}
        />
      )}
    </div>
  );
}
