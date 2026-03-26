import { useState } from "react";
import { DISPATCHER_STAGES, DISPATCHER_ROLES, ROLE_COLORS, ENGLISH_LEVELS, ENGLISH_COLORS } from "../constants/dispatcherData";

export default function DispatcherDrawer({ dispatcher, onClose, onUpd, onRemove }) {
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({});
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [newEntry, setNewEntry] = useState("");

  const logs = Array.isArray(dispatcher.logs) ? dispatcher.logs : [];

  function addLog() {
    const text = newEntry.trim();
    if (!text) return;
    const entry = { text, date: new Date().toLocaleString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }) };
    onUpd(dispatcher.id, { logs: [...logs, entry] });
    setNewEntry("");
  }

  function startEdit() {
    setForm({ ...dispatcher });
    setEditing(true);
  }

  function saveEdit() {
    onUpd(dispatcher.id, { ...form });
    setEditing(false);
  }

  function set(key, val) {
    setForm((p) => ({ ...p, [key]: val }));
  }

  const stageStyle = DISPATCHER_STAGES.find((s) => s.id === dispatcher.stage);

  return (
    <div style={{
      position: "fixed", top: 0, right: 0, width: 420, height: "100vh",
      background: "#fff", boxShadow: "-4px 0 32px rgba(0,0,0,.12)",
      zIndex: 300, display: "flex", flexDirection: "column", overflowY: "auto",
    }}>
      {/* Header */}
      <div style={{ padding: "18px 20px 14px", borderBottom: "1px solid #f1f5f9", display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div>
          <div style={{ fontSize: 17, fontWeight: 800, color: "#0f172a" }}>{dispatcher.name || "—"}</div>
          {dispatcher.role && (
            <span style={{
              fontSize: 11, fontWeight: 700,
              background: ROLE_COLORS[dispatcher.role]?.bg || "#f1f5f9",
              color: ROLE_COLORS[dispatcher.role]?.color || "#475569",
              border: `1px solid ${ROLE_COLORS[dispatcher.role]?.border || "#e2e8f0"}`,
              borderRadius: 20, padding: "2px 10px", marginTop: 5, display: "inline-block",
            }}>
              {dispatcher.role}
            </span>
          )}
        </div>
        <button onClick={onClose} style={{ background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 7, width: 30, height: 30, cursor: "pointer", color: "#64748b", fontSize: 14 }}>✕</button>
      </div>

      {/* Stage selector */}
      <div style={{ padding: "12px 20px", borderBottom: "1px solid #f1f5f9" }}>
        <select
          value={dispatcher.stage}
          onChange={(e) => onUpd(dispatcher.id, { stage: e.target.value })}
          style={{
            width: "100%", padding: "9px 12px", fontSize: 13, fontWeight: 600,
            border: `1.5px solid ${stageStyle?.color || "#e2e8f0"}`,
            borderRadius: 9, background: stageStyle?.light || "#f8fafc",
            color: stageStyle?.color || "#374151", cursor: "pointer", outline: "none",
          }}
        >
          {DISPATCHER_STAGES.map((s) => (
            <option key={s.id} value={s.id}>{s.label}</option>
          ))}
        </select>
      </div>

      {/* Info */}
      <div style={{ padding: "16px 20px", flex: 1, display: "flex", flexDirection: "column", gap: 12 }}>
        {editing ? (
          <>
            {/* Name */}
            <div>
              <div style={{ fontSize: 11, color: "#94a3b8", marginBottom: 4 }}>Full Name</div>
              <input value={form.name || ""} onChange={(e) => set("name", e.target.value)}
                style={inputStyle} placeholder="Full Name" />
            </div>

            {/* Role */}
            <div>
              <div style={{ fontSize: 11, color: "#94a3b8", marginBottom: 6 }}>Role</div>
              <div style={{ display: "flex", gap: 7, flexWrap: "wrap" }}>
                {DISPATCHER_ROLES.map((r) => {
                  const active = form.role === r;
                  const rc = ROLE_COLORS[r];
                  return (
                    <button key={r} onClick={() => set("role", r)} style={{
                      padding: "6px 14px", borderRadius: 20, fontSize: 12, fontWeight: 600,
                      border: `1.5px solid ${active ? rc.border : "#e2e8f0"}`,
                      background: active ? rc.bg : "#f8fafc",
                      color: active ? rc.color : "#64748b",
                      cursor: "pointer",
                    }}>{r}</button>
                  );
                })}
              </div>
            </div>

            {/* Telegram */}
            <div>
              <div style={{ fontSize: 11, color: "#94a3b8", marginBottom: 4 }}>Telegram</div>
              <input value={form.telegram || ""} onChange={(e) => set("telegram", e.target.value)}
                style={inputStyle} placeholder="@username" />
            </div>

            {/* Phone */}
            <div>
              <div style={{ fontSize: 11, color: "#94a3b8", marginBottom: 4 }}>Phone</div>
              <input value={form.phone || ""} onChange={(e) => set("phone", e.target.value)}
                style={inputStyle} placeholder="(555) 000-0000" />
            </div>

            {/* Note */}
            <div>
              <div style={{ fontSize: 11, color: "#94a3b8", marginBottom: 4 }}>Note</div>
              <textarea value={form.note || ""} onChange={(e) => set("note", e.target.value)}
                rows={4} placeholder="Comments about this candidate..."
                style={{ ...inputStyle, resize: "vertical", lineHeight: 1.6 }} />
            </div>

            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={saveEdit} style={btnPrimary}>Save</button>
              <button onClick={() => setEditing(false)} style={btnGray}>Cancel</button>
            </div>
          </>
        ) : (
          <>
            {/* View mode */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <InfoCell label="Telegram" value={dispatcher.telegram ? `@${dispatcher.telegram.replace(/^@/, "")}` : "—"} />
              <InfoCell label="Phone" value={dispatcher.phone || "—"} />
              {dispatcher.campaign && (
                <div style={{ gridColumn: "1/-1", background: "#faf5ff", border: "1px solid #e9d5ff", borderRadius: 9, padding: "10px 12px" }}>
                  <div style={{ fontSize: 10, color: "#a855f7", marginBottom: 3 }}>Campaign</div>
                  <div style={{ fontSize: 13, color: "#7c3aed", fontWeight: 500 }}>📢 {dispatcher.campaign}</div>
                </div>
              )}
            </div>

            {/* English Level */}
            <div>
              <div style={{ fontSize: 11, color: "#94a3b8", marginBottom: 7, fontWeight: 700, letterSpacing: ".06em", textTransform: "uppercase" }}>English Level</div>
              <div style={{ display: "flex", gap: 7, flexWrap: "wrap" }}>
                {ENGLISH_LEVELS.map((lvl) => {
                  const active = dispatcher.englishLevel === lvl;
                  const ec = ENGLISH_COLORS[lvl];
                  return (
                    <button key={lvl} onClick={() => onUpd(dispatcher.id, { englishLevel: lvl })} style={{
                      padding: "6px 14px", borderRadius: 20, fontSize: 12, fontWeight: 700,
                      border: `1.5px solid ${active ? ec.border : "#e2e8f0"}`,
                      background: active ? ec.bg : "#f8fafc",
                      color: active ? ec.color : "#94a3b8",
                      cursor: "pointer", transition: "all .12s",
                    }}>{lvl}</button>
                  );
                })}
              </div>
            </div>

            {/* Applied for (Role) */}
            <div>
              <div style={{ fontSize: 11, color: "#94a3b8", marginBottom: 7, fontWeight: 700, letterSpacing: ".06em", textTransform: "uppercase" }}>Applied for</div>
              <div style={{ display: "flex", gap: 7, flexWrap: "wrap" }}>
                {DISPATCHER_ROLES.map((r) => {
                  const active = dispatcher.role === r;
                  const rc = ROLE_COLORS[r];
                  return (
                    <button key={r} onClick={() => onUpd(dispatcher.id, { role: r })} style={{
                      padding: "6px 16px", borderRadius: 20, fontSize: 12, fontWeight: 600,
                      border: `1.5px solid ${active ? rc.border : "#e2e8f0"}`,
                      background: active ? rc.bg : "#f8fafc",
                      color: active ? rc.color : "#94a3b8",
                      cursor: "pointer", transition: "all .12s",
                    }}>{r}</button>
                  );
                })}
              </div>
            </div>

            {/* Note */}
            <div style={{ background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 9, padding: "12px 14px" }}>
              <div style={{ fontSize: 11, color: "#94a3b8", marginBottom: 5 }}>Note</div>
              <div style={{ fontSize: 13, color: "#374151", lineHeight: 1.6, whiteSpace: "pre-wrap" }}>
                {dispatcher.note || <span style={{ color: "#cbd5e1" }}>No notes yet</span>}
              </div>
            </div>

            {/* Resume */}
            <div>
              <div style={{ fontSize: 11, color: "#94a3b8", marginBottom: 6, fontWeight: 700, letterSpacing: ".06em", textTransform: "uppercase" }}>Resume</div>
              {dispatcher.resumeUrl ? (
                <div style={{ display: "flex", alignItems: "center", gap: 8, background: "#f0fdf4", border: "1px solid #a7f3d0", borderRadius: 8, padding: "10px 12px" }}>
                  <span style={{ fontSize: 13, color: "#059669", flex: 1 }}>📄 {dispatcher.resumeName || "Resume"}</span>
                  <a href={dispatcher.resumeUrl} target="_blank" rel="noopener noreferrer"
                    style={{ fontSize: 12, color: "#2563eb", textDecoration: "none", fontWeight: 600 }}>Open</a>
                </div>
              ) : (
                <label style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, border: "1.5px dashed #cbd5e1", borderRadius: 9, padding: "14px", cursor: "pointer", color: "#94a3b8", fontSize: 13 }}>
                  <input type="file" accept=".pdf,.doc,.docx" style={{ display: "none" }}
                    onChange={(e) => {
                      const file = e.target.files[0];
                      if (!file) return;
                      // Store as base64 data URL for simplicity
                      const reader = new FileReader();
                      reader.onload = () => {
                        onUpd(dispatcher.id, { resumeUrl: reader.result, resumeName: file.name });
                      };
                      reader.readAsDataURL(file);
                    }}
                  />
                  📎 Upload Resume (PDF / DOC)
                </label>
              )}
              {dispatcher.resumeUrl && (
                <button onClick={() => onUpd(dispatcher.id, { resumeUrl: null, resumeName: null })}
                  style={{ marginTop: 6, fontSize: 12, color: "#ef4444", background: "none", border: "none", cursor: "pointer" }}>
                  Remove resume
                </button>
              )}
            </div>

            {/* Log / Notes */}
            <div style={{ borderTop: "1px solid #f1f5f9", paddingTop: 14 }}>
              <div style={{ fontSize: 11, color: "#64748b", fontWeight: 700, letterSpacing: ".06em", textTransform: "uppercase", marginBottom: 10 }}>
                Log <span style={{ fontWeight: 400, color: "#94a3b8" }}>({logs.length})</span>
              </div>
              <textarea
                value={newEntry}
                onChange={(e) => setNewEntry(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && e.ctrlKey) addLog(); }}
                placeholder="Add a note… (Ctrl+Enter to save)"
                rows={3}
                style={{ width: "100%", padding: "9px 11px", fontSize: 13, background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 8, resize: "none", lineHeight: 1.6, outline: "none", boxSizing: "border-box" }}
              />
              <button onClick={addLog} style={{ marginTop: 6, padding: "7px 16px", background: "#2563eb", color: "#fff", border: "none", borderRadius: 7, fontSize: 12, fontWeight: 600, cursor: "pointer" }}>
                Add Entry
              </button>
              <div style={{ display: "flex", flexDirection: "column", gap: 7, marginTop: 10 }}>
                {logs.length === 0 && <div style={{ fontSize: 12, color: "#cbd5e1", textAlign: "center", padding: "10px 0" }}>No entries yet</div>}
                {[...logs].reverse().map((entry, i) => (
                  <div key={i} style={{ background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 8, padding: "9px 12px" }}>
                    <div style={{ fontSize: 10, color: "#94a3b8", marginBottom: 3 }}>{entry.date}</div>
                    <div style={{ fontSize: 13, color: "#374151", lineHeight: 1.6, whiteSpace: "pre-wrap" }}>{entry.text}</div>
                  </div>
                ))}
              </div>
            </div>

            <button onClick={startEdit} style={{ padding: "7px 14px", background: "#f1f5f9", color: "#475569", border: "1px solid #e2e8f0", borderRadius: 7, fontSize: 12, cursor: "pointer", alignSelf: "flex-start" }}>Edit Info</button>

            {/* Delete */}
            {confirmDelete ? (
              <div style={{ background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 9, padding: "12px 14px" }}>
                <div style={{ fontSize: 13, color: "#dc2626", marginBottom: 10, fontWeight: 600 }}>Delete {dispatcher.name}?</div>
                <div style={{ display: "flex", gap: 8 }}>
                  <button onClick={() => onRemove(dispatcher.id)} style={{ ...btnPrimary, background: "#ef4444", flex: 1 }}>Yes, delete</button>
                  <button onClick={() => setConfirmDelete(false)} style={{ ...btnGray, flex: 1 }}>Cancel</button>
                </div>
              </div>
            ) : (
              <button onClick={() => setConfirmDelete(true)} style={{ fontSize: 12, color: "#ef4444", background: "none", border: "none", cursor: "pointer", textAlign: "left", padding: 0 }}>
                🗑 Delete dispatcher
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function InfoCell({ label, value }) {
  return (
    <div style={{ background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 9, padding: "10px 12px" }}>
      <div style={{ fontSize: 10, color: "#94a3b8", marginBottom: 3 }}>{label}</div>
      <div style={{ fontSize: 13, color: "#0f172a", fontWeight: 500 }}>{value}</div>
    </div>
  );
}

const inputStyle = {
  width: "100%", padding: "9px 11px", fontSize: 13,
  background: "#f8fafc", border: "1px solid #e2e8f0",
  borderRadius: 8, color: "#0f172a", outline: "none", boxSizing: "border-box",
};

const btnPrimary = {
  flex: 1, padding: "9px", background: "#2563eb", color: "#fff",
  border: "none", borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: "pointer",
};

const btnGray = {
  flex: 1, padding: "9px", background: "#f1f5f9", color: "#475569",
  border: "1px solid #e2e8f0", borderRadius: 8, fontSize: 13, cursor: "pointer",
};
