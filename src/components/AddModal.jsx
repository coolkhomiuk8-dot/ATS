import { useState } from "react";
import { AVAILABILITY_OPTIONS, SOURCES, STAGES, TRUCK_TYPES } from "../constants/data";
import { getTodayPlus } from "../utils/date";
import { FL } from "./UiBits";

export default function AddModal({ onClose, onAdd }) {
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
    stage: "new",
    nextAction: getTodayPlus(1),
    nextActionTime: "10:00",
  });

  const setField = (field, value) => setForm((prev) => ({ ...prev, [field]: value }));

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(15,23,42,.45)",
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
          background: "#fff",
          borderRadius: 16,
          width: "100%",
          maxWidth: 480,
          padding: 26,
          boxShadow: "0 20px 60px rgba(0,0,0,.18)",
          maxHeight: "90vh",
          overflowY: "auto",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
          <div style={{ fontSize: 18, fontWeight: 700, color: "#0f172a" }}>Add New Driver</div>
          <button
            onClick={onClose}
            style={{
              background: "#f8fafc",
              border: "1px solid #e2e8f0",
              borderRadius: 7,
              width: 30,
              height: 30,
              cursor: "pointer",
              color: "#64748b",
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
                    background: "#f8fafc",
                    border: "1px solid #e2e8f0",
                    borderRadius: 8,
                    color: "#0f172a",
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
                style={{ width: "100%", padding: "9px 10px", fontSize: 13, background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 8, color: "#0f172a", outline: "none" }}
              />
            </div>
            <div>
              <FL t="Source" />
              <select
                value={form.source}
                onChange={(event) => setField("source", event.target.value)}
                style={{ width: "100%", padding: "9px 10px", fontSize: 13, background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 8, color: "#374151", outline: "none" }}
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
              style={{ width: "100%", padding: "9px 10px", fontSize: 13, background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 8, color: "#374151", outline: "none" }}
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
                    background: checked ? "#dbeafe" : "#f8fafc",
                    border: `1px solid ${checked ? "#93c5fd" : "#e2e8f0"}`,
                    color: checked ? "#1d4ed8" : "#64748b",
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
                style={{ width: "100%", padding: "9px 10px", fontSize: 13, background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 8, color: "#374151", outline: "none" }}
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
                  style={{ padding: "9px 8px", fontSize: 12, background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 8, color: "#374151", outline: "none" }}
                />
                <input
                  type="time"
                  value={form.nextActionTime}
                  onChange={(event) => setField("nextActionTime", event.target.value)}
                  style={{ padding: "9px 8px", fontSize: 12, background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 8, color: "#374151", outline: "none" }}
                />
              </div>
            </div>
          </div>

          <button
            onClick={() => {
              if (!form.name.trim() || !form.phone.trim()) return;
              onAdd({ ...form, exp: +form.exp || 0 });
            }}
            className="btn-p"
            style={{
              background: "#2563eb",
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
