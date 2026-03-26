import { useState } from "react";
import { DISPATCHER_STAGES, DISPATCHER_ROLES, ROLE_COLORS } from "../constants/dispatcherData";
import { useDispatchersStore } from "../store/useDispatchersStore";
import DispatcherCard from "../components/DispatcherCard";
import DispatcherDrawer from "../components/DispatcherDrawer";
import ImportFBModal from "../components/ImportFBModal";

export default function DispatchersView() {
  const { dispatchers, add, upd, remove } = useDispatchersStore();
  const [selected, setSelected] = useState(null);
  const [showAdd, setShowAdd] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [dragOverStage, setDragOverStage] = useState(null);

  const [importing, setImporting] = useState(false);
  const [importProgress, setImportProgress] = useState({ done: 0, total: 0 });
  const [importDone, setImportDone] = useState(false);

  async function handleBulkImport(leads) {
    setImporting(true);
    setImportDone(false);
    setImportProgress({ done: 0, total: leads.length });
    let saved = 0;
    for (let i = 0; i < leads.length; i++) {
      try {
        await add(leads[i]);
        saved++;
      } catch (err) {
        console.error("Import error on lead", i, err);
      }
      setImportProgress({ done: i + 1, total: leads.length });
    }
    setImporting(false);
    setImportDone(true);
    setImportProgress((p) => ({ ...p, saved }));
    setTimeout(() => setImportDone(false), 4000);
  }
  const [form, setForm] = useState({ name: "", telegram: "", phone: "", note: "", role: "", stage: "new_lead" });

  const selectedDispatcher = dispatchers.find((d) => d.id === selected);

  function setF(key, val) { setForm((p) => ({ ...p, [key]: val })); }

  async function handleAdd() {
    if (!form.name.trim()) return;
    await add({ ...form });
    setForm({ name: "", telegram: "", phone: "", note: "", role: "", stage: "new_lead" });
    setShowAdd(false);
  }

  async function handleRemove(id) {
    await remove(id);
    setSelected(null);
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", background: "var(--bg-base, #f1f5f9)" }}>
      {/* Top bar */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 20px", background: "#fff", borderBottom: "1px solid #e2e8f0" }}>
        <div>
          <div style={{ fontSize: 16, fontWeight: 800, color: "#0f172a" }}>Team Recruitment</div>
          <div style={{ fontSize: 12, color: "#94a3b8", marginTop: 1 }}>{dispatchers.length} candidates</div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={() => setShowImport(true)} style={{
            background: "#f0f9ff", color: "#0369a1", border: "1px solid #bae6fd",
            borderRadius: 9, padding: "9px 16px", fontSize: 13, fontWeight: 600, cursor: "pointer",
          }}>
            📥 Import from Facebook
          </button>
          <button onClick={() => setShowAdd(true)} style={{
            background: "#2563eb", color: "#fff", border: "none", borderRadius: 9,
            padding: "9px 18px", fontSize: 13, fontWeight: 600, cursor: "pointer",
          }}>
            + Add Candidate
          </button>
        </div>
      </div>

      {/* Kanban board */}
      <div style={{ flex: 1, overflowX: "auto", display: "flex", gap: 14, padding: 20 }}>
        {DISPATCHER_STAGES.map((stage) => {
          const cards = dispatchers.filter((d) => d.stage === stage.id);
          const isOver = dragOverStage === stage.id;
          return (
            <div
              key={stage.id}
              style={{ minWidth: 240, maxWidth: 260, display: "flex", flexDirection: "column", gap: 8 }}
              onDragOver={(e) => { e.preventDefault(); setDragOverStage(stage.id); }}
              onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget)) setDragOverStage(null); }}
              onDrop={(e) => {
                e.preventDefault();
                const id = e.dataTransfer.getData("dispatcherId");
                if (id) upd(id, { stage: stage.id });
                setDragOverStage(null);
              }}
            >
              {/* Column header */}
              <div style={{
                display: "flex", alignItems: "center", justifyContent: "space-between",
                padding: "8px 12px", background: isOver ? stage.light : "#fff",
                borderRadius: 10, border: `1px solid ${isOver ? stage.color : "#e2e8f0"}`,
                transition: "all .15s",
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
                  <div style={{ width: 8, height: 8, borderRadius: "50%", background: stage.color }} />
                  <span style={{ fontSize: 12, fontWeight: 700, color: "#374151" }}>{stage.label}</span>
                </div>
                <span style={{
                  fontSize: 11, fontWeight: 700,
                  background: stage.light, color: stage.color,
                  borderRadius: 12, padding: "2px 8px",
                }}>{cards.length}</span>
              </div>

              {/* Cards drop zone */}
              <div style={{
                display: "flex", flexDirection: "column", gap: 8,
                minHeight: 60, borderRadius: 10, padding: isOver ? "6px" : "0",
                background: isOver ? stage.light : "transparent",
                border: isOver ? `2px dashed ${stage.color}` : "2px dashed transparent",
                transition: "all .15s",
              }}>
                {cards.length === 0 && !isOver && (
                  <div style={{ textAlign: "center", padding: "20px 0", fontSize: 12, color: "#cbd5e1", background: "#fff", borderRadius: 10, border: "1px dashed #e2e8f0" }}>
                    Empty
                  </div>
                )}
                {cards.map((d) => (
                  <DispatcherCard key={d.id} dispatcher={d} onClick={() => setSelected(d.id)} />
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {/* Drawer */}
      {selectedDispatcher && (
        <>
          <div onClick={() => setSelected(null)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.2)", zIndex: 299 }} />
          <DispatcherDrawer
            dispatcher={selectedDispatcher}
            onClose={() => setSelected(null)}
            onUpd={upd}
            onRemove={handleRemove}
          />
        </>
      )}

      {/* Import progress overlay */}
      {importing && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,.6)", zIndex: 600,
          display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div style={{ background: "#fff", borderRadius: 16, padding: "32px 40px", textAlign: "center",
            boxShadow: "0 20px 60px rgba(0,0,0,.25)", minWidth: 300 }}>
            <div style={{ fontSize: 36, marginBottom: 12 }}>⏳</div>
            <div style={{ fontSize: 15, fontWeight: 700, color: "#0f172a", marginBottom: 6 }}>
              Importing leads...
            </div>
            <div style={{ fontSize: 13, color: "#64748b", marginBottom: 16 }}>
              {importProgress.done} / {importProgress.total}
            </div>
            {/* Progress bar */}
            <div style={{ width: "100%", height: 8, background: "#e2e8f0", borderRadius: 99, overflow: "hidden" }}>
              <div style={{
                height: "100%", borderRadius: 99, background: "#2563eb",
                width: `${(importProgress.done / importProgress.total) * 100}%`,
                transition: "width .2s ease",
              }} />
            </div>
          </div>
        </div>
      )}

      {/* Success toast */}
      {importDone && (
        <div style={{ position: "fixed", bottom: 90, left: "50%", transform: "translateX(-50%)",
          background: "#10b981", color: "#fff", borderRadius: 10, padding: "12px 24px",
          fontSize: 14, fontWeight: 600, boxShadow: "0 8px 24px rgba(0,0,0,.18)", zIndex: 700,
          display: "flex", alignItems: "center", gap: 8 }}>
          ✅ Successfully imported {importProgress.total} leads into New Lead
        </div>
      )}

      {/* Import modal */}
      {showImport && (
        <ImportFBModal
          onClose={() => setShowImport(false)}
          onImport={handleBulkImport}
          existingPhones={dispatchers.map((d) => d.phone)}
        />
      )}

      {/* Add modal */}
      {showAdd && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,.5)", zIndex: 400, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}
          onClick={() => setShowAdd(false)}>
          <div onClick={(e) => e.stopPropagation()} style={{ background: "#fff", borderRadius: 16, width: "100%", maxWidth: 420, padding: 26, boxShadow: "0 20px 60px rgba(0,0,0,.2)" }}>
            <div style={{ fontSize: 17, fontWeight: 700, color: "#0f172a", marginBottom: 18 }}>Add Candidate</div>

            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {/* Name */}
              <div>
                <div style={labelStyle}>Full Name *</div>
                <input value={form.name} onChange={(e) => setF("name", e.target.value)}
                  style={inputStyle} placeholder="John Doe" />
              </div>

              {/* Role */}
              <div>
                <div style={labelStyle}>Role</div>
                <div style={{ display: "flex", gap: 7, flexWrap: "wrap" }}>
                  {DISPATCHER_ROLES.map((r) => {
                    const active = form.role === r;
                    const rc = ROLE_COLORS[r];
                    return (
                      <button key={r} onClick={() => setF("role", r)} style={{
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
                <div style={labelStyle}>Telegram</div>
                <input value={form.telegram} onChange={(e) => setF("telegram", e.target.value)}
                  style={inputStyle} placeholder="@username" />
              </div>

              {/* Phone */}
              <div>
                <div style={labelStyle}>Phone</div>
                <input value={form.phone} onChange={(e) => setF("phone", e.target.value)}
                  style={inputStyle} placeholder="(555) 000-0000" />
              </div>

              {/* Stage */}
              <div>
                <div style={labelStyle}>Initial Stage</div>
                <select value={form.stage} onChange={(e) => setF("stage", e.target.value)} style={{ ...inputStyle, cursor: "pointer" }}>
                  {DISPATCHER_STAGES.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
                </select>
              </div>

              {/* Note */}
              <div>
                <div style={labelStyle}>Note</div>
                <textarea value={form.note} onChange={(e) => setF("note", e.target.value)}
                  rows={3} placeholder="Comments about this candidate..."
                  style={{ ...inputStyle, resize: "vertical", lineHeight: 1.6 }} />
              </div>

              <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
                <button onClick={handleAdd} style={{ flex: 1, padding: "11px", background: "#2563eb", color: "#fff", border: "none", borderRadius: 9, fontSize: 14, fontWeight: 600, cursor: "pointer" }}>
                  Add Candidate
                </button>
                <button onClick={() => setShowAdd(false)} style={{ padding: "11px 18px", background: "#f1f5f9", color: "#475569", border: "1px solid #e2e8f0", borderRadius: 9, fontSize: 13, cursor: "pointer" }}>
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const labelStyle = { fontSize: 11, color: "#64748b", marginBottom: 4, fontWeight: 600 };
const inputStyle = {
  width: "100%", padding: "9px 11px", fontSize: 13,
  background: "#f8fafc", border: "1px solid #e2e8f0",
  borderRadius: 8, color: "#0f172a", outline: "none", boxSizing: "border-box",
};
