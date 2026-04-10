import { useState } from "react";
import { STAGES } from "../constants/data";

export default function DriverAlertsPanel({ alerts, onReschedule, onDone, onDriverClick, open, onToggle }) {
  const [expandedId, setExpandedId] = useState(null);
  const [rescheduleId, setRescheduleId] = useState(null);
  const [rescheduleDate, setRescheduleDate] = useState("");
  const [rescheduleTime, setRescheduleTime] = useState("");
  const [doneDriver, setDoneDriver] = useState(null);
  const [selectedStage, setSelectedStage] = useState("");

  if (!open) return null;

  function toggleExpand(id) {
    setExpandedId((prev) => (prev === id ? null : id));
    setRescheduleId(null);
  }

  function openReschedule(driver, e) {
    e.stopPropagation();
    setRescheduleId(driver.id);
    setRescheduleDate(driver.nextAction || "");
    setRescheduleTime(driver.nextActionTime || "10:00");
  }

  function saveReschedule(driver, e) {
    e.stopPropagation();
    if (!rescheduleDate) return;
    onReschedule(driver.id, rescheduleDate, rescheduleTime);
    setRescheduleId(null);
    setExpandedId(null);
  }

  function openDone(driver, e) {
    e.stopPropagation();
    const currentIdx = STAGES.findIndex((s) => s.id === driver.stage);
    const nextStage = STAGES[currentIdx + 1] || STAGES[currentIdx];
    setSelectedStage(nextStage?.id || STAGES[0].id);
    setDoneDriver(driver);
  }

  function confirmDone(moveStage) {
    if (moveStage && selectedStage) onDone(doneDriver.id, selectedStage);
    setDoneDriver(null);
    setExpandedId(null);
  }

  return (
    <>
      {/* ── Main panel ── */}
      <div
        style={{
          position: "fixed",
          bottom: 24,
          right: 24,
          width: 340,
          background: "var(--bg-surface)",
          border: "1.5px solid var(--color-warning-border)",
          borderRadius: 14,
          boxShadow: "var(--shadow-md)",
          zIndex: 1000,
          overflow: "hidden",
        }}
      >
        {/* Header */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "11px 14px",
            background: "var(--color-warning-bg)",
            borderBottom: "1px solid var(--color-warning-border)",
            cursor: "pointer",
            userSelect: "none",
          }}
          onClick={onToggle}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 16 }}>⏰</span>
            <span style={{ fontSize: 13, fontWeight: 700, color: "var(--color-warning-text)" }}>
              Alerts
            </span>
            <span
              style={{
                fontSize: 11, fontWeight: 700,
                background: "var(--color-warning)", color: "#fff",
                borderRadius: 20, padding: "1px 8px", minWidth: 20, textAlign: "center",
              }}
            >
              {alerts.length}
            </span>
          </div>
          <span style={{ fontSize: 13, color: "var(--color-warning-text)", fontWeight: 600 }}>✕</span>
        </div>

        {/* Scrollable list */}
        <div style={{ maxHeight: 420, overflowY: "auto" }}>
          {alerts.length === 0 ? (
            <div style={{ padding: "20px 14px", fontSize: 13, color: "var(--text-muted)", textAlign: "center" }}>
              No pending actions
            </div>
          ) : alerts.map((driver, idx) => {
            const isExpanded = expandedId === driver.id;
            const isRescheduling = rescheduleId === driver.id;
            const isOverdue = driver.nextAction < new Date().toISOString().split("T")[0];

            return (
              <div
                key={driver.id}
                style={{
                  borderBottom: idx < alerts.length - 1 ? "1px solid var(--border)" : "none",
                  background: isExpanded ? "var(--color-warning-bg)" : "var(--bg-surface)",
                  transition: "background .15s",
                }}
              >
                <div
                  onClick={() => toggleExpand(driver.id)}
                  style={{
                    display: "flex", alignItems: "center", justifyContent: "space-between",
                    padding: "10px 14px", cursor: "pointer",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
                    <div style={{
                      width: 7, height: 7, borderRadius: "50%",
                      background: isOverdue ? "var(--color-danger)" : "var(--color-warning)",
                      flexShrink: 0,
                    }} />
                    <div style={{ minWidth: 0 }}>
                      <div
                        onClick={(e) => { e.stopPropagation(); onDriverClick?.(driver.id); }}
                        style={{
                          fontSize: 13, fontWeight: 600, color: "var(--color-primary)",
                          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                          cursor: "pointer", textDecoration: "underline",
                        }}
                      >
                        {driver.name}
                      </div>
                      <div style={{ fontSize: 11, color: isOverdue ? "var(--color-danger)" : "var(--text-faint)" }}>
                        {driver.nextAction} · {driver.nextActionTime || "—"}
                      </div>
                    </div>
                  </div>
                  <span style={{ fontSize: 11, color: "var(--text-faint)", flexShrink: 0, marginLeft: 8 }}>
                    {isExpanded ? "▲" : "▼"}
                  </span>
                </div>

                {isExpanded && (
                  <div style={{ padding: "0 14px 12px" }}>
                    {isRescheduling ? (
                      <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
                        <div style={{ display: "flex", gap: 6 }}>
                          <input type="date" value={rescheduleDate}
                            onChange={(e) => setRescheduleDate(e.target.value)}
                            style={{ flex: 1, padding: "7px 8px", border: "1px solid var(--border)", borderRadius: 7, fontSize: 12, outline: "none", background: "var(--bg-raised)", color: "var(--text-primary)" }}
                          />
                          <input type="time" value={rescheduleTime}
                            onChange={(e) => setRescheduleTime(e.target.value)}
                            style={{ width: 95, padding: "7px 8px", border: "1px solid var(--border)", borderRadius: 7, fontSize: 12, outline: "none", background: "var(--bg-raised)", color: "var(--text-primary)" }}
                          />
                        </div>
                        <div style={{ display: "flex", gap: 6 }}>
                          <button onClick={(e) => saveReschedule(driver, e)}
                            style={{ flex: 1, padding: "7px", background: "var(--color-primary)", color: "#fff", border: "none", borderRadius: 7, fontSize: 12, fontWeight: 600, cursor: "pointer" }}>
                            Save
                          </button>
                          <button onClick={(e) => { e.stopPropagation(); setRescheduleId(null); }}
                            style={{ flex: 1, padding: "7px", background: "var(--bg-hover)", color: "var(--text-muted)", border: "1px solid var(--border)", borderRadius: 7, fontSize: 12, cursor: "pointer" }}>
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div style={{ display: "flex", gap: 7 }}>
                        <button onClick={(e) => openReschedule(driver, e)}
                          style={{ flex: 1, padding: "8px", background: "var(--bg-hover)", color: "var(--text-muted)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: "pointer" }}>
                          Reschedule
                        </button>
                        <button onClick={(e) => openDone(driver, e)}
                          style={{ flex: 1, padding: "8px", background: "var(--color-success)", color: "#fff", border: "none", borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: "pointer" }}>
                          Done ✓
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Done modal ── */}
      {doneDriver && (
        <div style={{ position: "fixed", inset: 0, background: "var(--overlay)", zIndex: 2000, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div style={{ background: "var(--bg-surface)", borderRadius: 16, padding: 28, width: 380, boxShadow: "var(--shadow-lg)" }}>
            <div style={{ fontSize: 16, fontWeight: 700, color: "var(--text-primary)", marginBottom: 6 }}>Move to next stage?</div>
            <div style={{ fontSize: 13, color: "var(--text-muted)", marginBottom: 18 }}>
              Where would you like to move{" "}
              <span style={{ fontWeight: 600, color: "var(--text-primary)" }}>{doneDriver.name}</span>?
            </div>
            <label style={{ fontSize: 11, fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: ".06em" }}>Select stage</label>
            <select value={selectedStage} onChange={(e) => setSelectedStage(e.target.value)}
              style={{ width: "100%", padding: "10px 12px", border: "1px solid var(--border)", borderRadius: 9, fontSize: 13, marginTop: 6, marginBottom: 20, background: "var(--bg-raised)", color: "var(--text-primary)", outline: "none" }}>
              {STAGES.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
            </select>
            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={() => confirmDone(false)}
                style={{ flex: 1, padding: "10px", background: "var(--bg-hover)", color: "var(--text-muted)", border: "1px solid var(--border)", borderRadius: 9, fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
                Just close
              </button>
              <button onClick={() => confirmDone(true)}
                style={{ flex: 2, padding: "10px", background: "var(--color-primary)", color: "#fff", border: "none", borderRadius: 9, fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
                Move & done ✓
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
