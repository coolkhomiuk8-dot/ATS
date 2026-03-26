import { useState } from "react";
import { AVAILABILITY_OPTIONS, FLAGS_OPT, SOURCES, STAGES, TRUCK_TYPES } from "../constants/data";
import { getTodayPlus } from "../utils/date";
import { FL } from "./UiBits";

export default function AddModal({ onClose, onAdd, drivers = [] }) {
  const [dupDriver, setDupDriver] = useState(null);
  const [form, setForm] = useState({
    name: "",
    phone: "",
    email: "",
    city: "",
    cdl: "A",
    exp: "",
    source: "Indeed",
    startDate: "TBD",
    truckTypes: [],
    flags: [],
    notes: [],
    stage: "new",
    nextAction: getTodayPlus(1),
    nextActionTime: "10:00",
  });
  const [noteText, setNoteText] = useState("");

  const formatPhone = (raw) => {
    const digits = raw.replace(/\D/g, "").slice(0, 10);
    if (digits.length <= 3) return digits;
    if (digits.length <= 6) return `(${digits.slice(0, 3)}) ${digits.slice(3)}`;
    return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
  };

  const setField = (field, value) => {
    if (field === "phone") {
      setDupDriver(null);
      setForm((prev) => ({ ...prev, phone: formatPhone(value) }));
      return;
    }
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "var(--overlay)",
        zIndex: 200,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 20,
      }}
      onClick={onClose}
    >
      <div
        className="f-up"
        onClick={(event) => event.stopPropagation()}
        style={{
          background: "var(--bg-surface)",
          borderRadius: 16,
          width: "100%",
          maxWidth: 480,
          padding: 26,
          boxShadow: "var(--shadow-lg)",
          border: "1px solid var(--border)",
          maxHeight: "90vh",
          overflowY: "auto",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
          <div style={{ fontSize: 18, fontWeight: 700, color: "var(--text-primary)" }}>Add New Driver</div>
          <button
            onClick={onClose}
            style={{
              background: "var(--bg-raised)",
              border: "1px solid var(--border)",
              borderRadius: 7,
              width: 30,
              height: 30,
              cursor: "pointer",
              color: "var(--text-muted)",
              fontSize: 14,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            x
          </button>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 11 }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            {[
              ["name", "Full Name *", "James Miller"],
              ["phone", "Phone *", "555-0100"],
              ["email", "Email", "driver@email.com"],
              ["city", "City / State", "Chicago, IL"],
            ].map(([key, label, placeholder]) => (
              <div key={key}>
                <FL t={label} />
                <input
                  value={form[key]}
                  onChange={(event) => setField(key, event.target.value)}
                  placeholder={placeholder}
                  style={{
                    width: "100%",
                    padding: "9px 11px",
                    fontSize: 13,
                    background: "var(--bg-raised)",
                    border: "1px solid var(--border)",
                    borderRadius: 8,
                    color: "var(--text-primary)",
                    outline: "none",
                  }}
                />
              </div>
            ))}
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <div>
              <FL t="Exp (yrs)" />
              <input
                type="number"
                value={form.exp}
                onChange={(event) => setField("exp", event.target.value)}
                placeholder="0"
                min="0"
                style={{ width: "100%", padding: "9px 10px", fontSize: 13, background: "var(--bg-raised)", border: "1px solid var(--border)", borderRadius: 8, color: "var(--text-primary)", outline: "none" }}
              />
            </div>
            <div>
              <FL t="Source" />
              <select
                value={form.source}
                onChange={(event) => setField("source", event.target.value)}
                style={{ width: "100%", padding: "9px 10px", fontSize: 13, background: "var(--bg-raised)", border: "1px solid var(--border)", borderRadius: 8, color: "var(--text-secondary)", outline: "none" }}
              >
                {SOURCES.map((source) => (
                  <option key={source}>{source}</option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <FL t="Available" />
            <select
              value={form.startDate}
              onChange={(event) => setField("startDate", event.target.value)}
              style={{ width: "100%", padding: "9px 10px", fontSize: 13, background: "var(--bg-raised)", border: "1px solid var(--border)", borderRadius: 8, color: "var(--text-secondary)", outline: "none" }}
            >
              {AVAILABILITY_OPTIONS.map((opt) => (
                <option key={opt}>{opt}</option>
              ))}
            </select>
          </div>

          <div>
            <FL t="Truck Type" />
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 4 }}>
              {TRUCK_TYPES.map((type) => {
                const checked = (form.truckTypes || []).includes(type);
                return (
                  <label key={type} style={{
                    display: "flex", alignItems: "center", gap: 5,
                    padding: "5px 10px", borderRadius: 6, cursor: "pointer",
                    fontSize: 12, fontWeight: 500,
                    background: checked ? "var(--color-primary-light)" : "var(--bg-raised)",
                    border: `1px solid ${checked ? "var(--color-primary-border)" : "var(--border)"}`,
                    color: checked ? "var(--color-primary-dark)" : "var(--text-muted)",
                    transition: "all .12s",
                  }}>
                    <input
                      type="checkbox"
                      checked={checked}
                      style={{ display: "none" }}
                      onChange={() => {
                        const prev = form.truckTypes || [];
                        setField("truckTypes", checked ? prev.filter((t) => t !== type) : [...prev, type]);
                      }}
                    />
                    {checked ? "✓ " : ""}{type}
                  </label>
                );
              })}
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <div>
              <FL t="Initial Stage" />
              <select
                value={form.stage}
                onChange={(event) => setField("stage", event.target.value)}
                style={{ width: "100%", padding: "9px 10px", fontSize: 13, background: "var(--bg-raised)", border: "1px solid var(--border)", borderRadius: 8, color: "var(--text-secondary)", outline: "none" }}
              >
                {STAGES.map((stage) => (
                  <option key={stage.id} value={stage.id}>{stage.label}</option>
                ))}
              </select>
            </div>
            <div>
              <FL t="Next Action" />
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
                <input
                  type="date"
                  value={form.nextAction}
                  onChange={(event) => setField("nextAction", event.target.value)}
                  style={{ padding: "9px 8px", fontSize: 12, background: "var(--bg-raised)", border: "1px solid var(--border)", borderRadius: 8, color: "var(--text-secondary)", outline: "none" }}
                />
                <input
                  type="time"
                  value={form.nextActionTime}
                  onChange={(event) => setField("nextActionTime", event.target.value)}
                  style={{ padding: "9px 8px", fontSize: 12, background: "var(--bg-raised)", border: "1px solid var(--border)", borderRadius: 8, color: "var(--text-secondary)", outline: "none" }}
                />
              </div>
            </div>
          </div>

          {/* ── LOG ── */}
          <div style={{ borderTop: "1px solid var(--border)", paddingTop: 14, marginTop: 2 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text-muted)", letterSpacing: ".06em", textTransform: "uppercase", marginBottom: 8 }}>
              Log <span style={{ fontWeight: 400, color: "var(--text-faint)" }}>({form.notes.length})</span>
            </div>
            <textarea
              value={noteText}
              onChange={(e) => setNoteText(e.target.value)}
              placeholder="Log a call, text, email or note"
              rows={3}
              style={{ width: "100%", padding: "9px 11px", fontSize: 13, background: "var(--bg-raised)", border: "1px solid var(--border)", borderRadius: 8, resize: "vertical", lineHeight: 1.6, color: "var(--text-primary)", outline: "none" }}
            />
            <button
              onClick={() => {
                if (!noteText.trim()) return;
                const entry = { text: noteText.trim(), date: new Date().toLocaleString() };
                setForm((prev) => ({ ...prev, notes: [entry, ...prev.notes] }));
                setNoteText("");
              }}
              style={{ marginTop: 6, padding: "7px 14px", background: "var(--color-primary)", color: "#fff", border: "none", borderRadius: 7, fontSize: 12, fontWeight: 600, cursor: "pointer" }}
            >
              Add Entry
            </button>
            {form.notes.length > 0 && (
              <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 10 }}>
                {form.notes.map((n, i) => (
                  <div key={i} style={{ background: "var(--bg-raised)", border: "1px solid var(--border)", borderRadius: 8, padding: "9px 11px" }}>
                    <div style={{ fontSize: 10, color: "var(--text-faint)", marginBottom: 3 }}>{n.date}</div>
                    <div style={{ fontSize: 13, color: "var(--text-secondary)", whiteSpace: "pre-wrap" }}>{n.text}</div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* ── FLAGS ── */}
          <div style={{ borderTop: "1px solid var(--border)", paddingTop: 14, marginTop: 2 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text-muted)", letterSpacing: ".06em", textTransform: "uppercase", marginBottom: 8 }}>Flags</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {FLAGS_OPT.map((flag) => {
                const active = form.flags.includes(flag.label);
                const isGreen = flag.type === "green";
                return (
                  <label
                    key={flag.label}
                    style={{
                      display: "flex", alignItems: "center", gap: 10,
                      padding: "9px 12px", borderRadius: 8, cursor: "pointer",
                      background: active ? (isGreen ? "var(--color-success-bg)" : "var(--color-danger-bg)") : "var(--bg-raised)",
                      border: `1px solid ${active ? (isGreen ? "var(--color-success-border)" : "var(--color-danger-border)") : "var(--border)"}`,
                      transition: "all .12s",
                    }}
                  >
                    <div style={{
                      width: 15, height: 15, borderRadius: 4, flexShrink: 0,
                      border: `2px solid ${active ? (isGreen ? "var(--color-success)" : "var(--color-danger)") : "var(--text-disabled)"}`,
                      background: active ? (isGreen ? "var(--color-success)" : "var(--color-danger)") : "transparent",
                      display: "flex", alignItems: "center", justifyContent: "center",
                    }}>
                      {active && <span style={{ color: "#fff", fontSize: 9, fontWeight: 700 }}>✓</span>}
                    </div>
                    <input type="checkbox" style={{ display: "none" }} checked={active} onChange={() => {
                      setForm((prev) => ({
                        ...prev,
                        flags: active ? prev.flags.filter((f) => f !== flag.label) : [...prev.flags, flag.label],
                      }));
                    }} />
                    <span style={{ fontSize: 13, color: active ? (isGreen ? "var(--color-success-text)" : "var(--color-danger-text)") : "var(--text-secondary)", fontWeight: active ? 600 : 400 }}>{flag.label}</span>
                  </label>
                );
              })}
            </div>
          </div>

          {dupDriver && (
            <div style={{
              background: "var(--color-danger-bg)", border: "1.5px solid var(--color-danger-border)", borderRadius: 10,
              padding: "12px 14px", marginBottom: 10, fontSize: 13, color: "var(--color-danger-text)",
            }}>
              ⚠️ Водій з таким номером телефону вже є в системі:<br />
              <b>{dupDriver.name}</b> · {dupDriver.phone} · <span style={{ color: "var(--text-muted)" }}>{dupDriver.stage}</span>
            </div>
          )}
          <button
            onClick={() => {
              if (!form.name.trim() || !form.phone.trim()) return;
              const normalized = form.phone.replace(/\D/g, "");
              const dup = normalized.length >= 7
                ? drivers.find(d => (d.phone || "").replace(/\D/g, "") === normalized)
                : null;
              if (dup) { setDupDriver(dup); return; }
              setDupDriver(null);
              onAdd({ ...form, exp: +form.exp || 0 });
            }}
            className="btn-p"
            style={{
              background: "var(--color-primary)",
              border: "none",
              color: "#fff",
              padding: "11px",
              borderRadius: 9,
              fontSize: 14,
              fontWeight: 600,
              cursor: "pointer",
              marginTop: 4,
            }}
          >
            Add Driver
          </button>
        </div>
      </div>
    </div>
  );
}
