import { useState } from "react";
import { STAGES } from "../constants/data";

export default function DriverAlertsPanel({ alerts, onReschedule, onDone, onDismiss }) {
  const [minimized, setMinimized] = useState(false);
  const [expandedKey, setExpandedKey] = useState(null);
  const [rescheduleKey, setRescheduleKey] = useState(null);
  const [rescheduleDate, setRescheduleDate] = useState("");
  const [rescheduleTime, setRescheduleTime] = useState("");
  const [doneAlert, setDoneAlert] = useState(null);
  const [selectedStage, setSelectedStage] = useState("");

  if (alerts.length === 0) return null;

  function toggleExpand(key) {
    setExpandedKey((prev) => (prev === key ? null : key));
    setRescheduleKey(null);
  }

  function openReschedule(alert, e) {
    e.stopPropagation();
    setRescheduleKey(alert.key);
    setRescheduleDate(alert.driver.nextAction || "");
    setRescheduleTime(alert.driver.nextActionTime || "10:00");
  }

  function saveReschedule(alert, e) {
    e.stopPropagation();
    if (!rescheduleDate) return;
    onReschedule(alert.driver.id, rescheduleDate, rescheduleTime);
    onDismiss(alert.key);
    setRescheduleKey(null);
    setExpandedKey(null);
  }

  function openDone(alert, e) {
    e.stopPropagation();
    const currentIdx = STAGES.findIndex((s) => s.id === alert.driver.stage);
    const nextStage = STAGES[currentIdx + 1] || STAGES[currentIdx];
    setSelectedStage(nextStage?.id || STAGES[0].id);
    setDoneAlert(alert);
  }

  function confirmDone(moveStage) {
    if (moveStage && selectedStage) onDone(doneAlert.driver.id, selectedStage);
    onDismiss(doneAlert.key);
    setDoneAlert(null);
    setExpandedKey(null);
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
            borderBottom: minimized ? "none" : "1px solid var(--color-warning-border)",
            cursor: "pointer",
            userSelect: "none",
          }}
          onClick={() => setMinimized((v) => !v)}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 16 }}>⏰</span>
            <span style={{ fontSize: 13, fontWeight: 700, color: "var(--color-warning-text)" }}>
              Alerts
            </span>
            <span
              style={{
                fontSize: 11,
                fontWeight: 700,
                background: "var(--color-warning)",
                color: "#fff",
                borderRadius: 20,
                padding: "1px 8px",
                minWidth: 20,
                textAlign: "center",
              }}
            >
              {alerts.length}
            </span>
          </div>
          <span style={{ fontSize: 13, color: "var(--color-warning-text)", fontWeight: 600 }}>
            {minimized ? "▲" : "▼"}
          </span>
        </div>

        {/* Scrollable list */}
        {!minimized && (
          <div style={{ maxHeight: 420, overflowY: "auto" }}>
            {alerts.map((alert, idx) => {
              const isExpanded = expandedKey === alert.key;
              const isRescheduling = rescheduleKey === alert.key;

              return (
                <div
                  key={alert.key}
                  style={{
                    borderBottom: idx < alerts.length - 1 ? "1px solid var(--border)" : "none",
                    background: isExpanded ? "var(--color-warning-bg)" : "var(--bg-surface)",
                    transition: "background .15s",
                  }}
                >
                  {/* Row header — click to expand */}
                  <div
                    onClick={() => toggleExpand(alert.key)}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      padding: "10px 14px",
                      cursor: "pointer",
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
                      <div
                        style={{
                          width: 7,
                          height: 7,
                          borderRadius: "50%",
                          background: "var(--color-warning)",
                          flexShrink: 0,
                        }}
                      />
                      <div style={{ minWidth: 0 }}>
                        <div
                          style={{
                            fontSize: 13,
                            fontWeight: 600,
                            color: "var(--text-primary)",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                          }}
                        >
                          {alert.driver.name}
                        </div>
                        <div style={{ fontSize: 11, color: "var(--text-faint)" }}>
                          {alert.driver.nextAction} · {alert.driver.nextActionTime}
                        </div>
                      </div>
                    </div>
                    <span style={{ fontSize: 11, color: "var(--text-faint)", flexShrink: 0, marginLeft: 8 }}>
                      {isExpanded ? "▲" : "▼"}
                    </span>
                  </div>

                  {/* Expanded area */}
                  {isExpanded && (
                    <div style={{ padding: "0 14px 12px" }}>
                      {isRescheduling ? (
                        <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
                          <div style={{ display: "flex", gap: 6 }}>
                            <input
                              type="date"
                              value={rescheduleDate}
                              onChange={(e) => setRescheduleDate(e.target.value)}
                              style={{
                                flex: 1,
                                padding: "7px 8px",
                                border: "1px solid var(--border)",
                                borderRadius: 7,
                                fontSize: 12,
                                outline: "none",
                                background: "var(--bg-raised)",
                                color: "var(--text-primary)",
                              }}
                            />
                            <input
                              type="time"
                              value={rescheduleTime}
                              onChange={(e) => setRescheduleTime(e.target.value)}
                              style={{
                                width: 95,
                                padding: "7px 8px",
                                border: "1px solid var(--border)",
                                borderRadius: 7,
                                fontSize: 12,
                                outline: "none",
                                background: "var(--bg-raised)",
                                color: "var(--text-primary)",
                              }}
                            />
                          </div>
                          <div style={{ display: "flex", gap: 6 }}>
                            <button
                              onClick={(e) => saveReschedule(alert, e)}
                              style={{
                                flex: 1,
                                padding: "7px",
                                background: "var(--color-primary)",
                                color: "#fff",
                                border: "none",
                                borderRadius: 7,
                                fontSize: 12,
                                fontWeight: 600,
                                cursor: "pointer",
                              }}
                            >
                              Save
                            </button>
                            <button
                              onClick={(e) => { e.stopPropagation(); setRescheduleKey(null); }}
                              style={{
                                flex: 1,
                                padding: "7px",
                                background: "var(--bg-hover)",
                                color: "var(--text-muted)",
                                border: "1px solid var(--border)",
                                borderRadius: 7,
                                fontSize: 12,
                                cursor: "pointer",
                              }}
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div style={{ display: "flex", gap: 7 }}>
                          <button
                            onClick={(e) => openReschedule(alert, e)}
                            style={{
                              flex: 1,
                              padding: "8px",
                              background: "var(--bg-hover)",
                              color: "var(--text-muted)",
                              border: "1px solid var(--border)",
                              borderRadius: 8,
                              fontSize: 12,
                              fontWeight: 600,
                              cursor: "pointer",
                            }}
                          >
                            Reschedule
                          </button>
                          <button
                            onClick={(e) => openDone(alert, e)}
                            style={{
                              flex: 1,
                              padding: "8px",
                              background: "var(--color-success)",
                              color: "#fff",
                              border: "none",
                              borderRadius: 8,
                              fontSize: 12,
                              fontWeight: 600,
                              cursor: "pointer",
                            }}
                          >
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
        )}
      </div>

      {/* ── Done modal ── */}
      {doneAlert && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "var(--overlay)",
            zIndex: 2000,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <div
            style={{
              background: "var(--bg-surface)",
              borderRadius: 16,
              padding: 28,
              width: 380,
              boxShadow: "var(--shadow-lg)",
            }}
          >
            <div style={{ fontSize: 16, fontWeight: 700, color: "var(--text-primary)", marginBottom: 6 }}>
              Move to next stage?
            </div>
            <div style={{ fontSize: 13, color: "var(--text-muted)", marginBottom: 18 }}>
              Where would you like to move{" "}
              <span style={{ fontWeight: 600, color: "var(--text-primary)" }}>{doneAlert.driver.name}</span>?
            </div>

            <label
              style={{
                fontSize: 11,
                fontWeight: 600,
                color: "var(--text-muted)",
                textTransform: "uppercase",
                letterSpacing: ".06em",
              }}
            >
              Select stage
            </label>
            <select
              value={selectedStage}
              onChange={(e) => setSelectedStage(e.target.value)}
              style={{
                width: "100%",
                padding: "10px 12px",
                border: "1px solid var(--border)",
                borderRadius: 9,
                fontSize: 13,
                marginTop: 6,
                marginBottom: 20,
                background: "var(--bg-raised)",
                color: "var(--text-primary)",
                outline: "none",
              }}
            >
              {STAGES.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label}
                </option>
              ))}
            </select>

            <div style={{ display: "flex", gap: 10 }}>
              <button
                onClick={() => confirmDone(false)}
                style={{
                  flex: 1,
                  padding: "10px",
                  background: "var(--bg-hover)",
                  color: "var(--text-muted)",
                  border: "1px solid var(--border)",
                  borderRadius: 9,
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                Just close
              </button>
              <button
                onClick={() => confirmDone(true)}
                style={{
                  flex: 2,
                  padding: "10px",
                  background: "var(--color-primary)",
                  color: "#fff",
                  border: "none",
                  borderRadius: 9,
                  fontSize: 13,
                  fontWeight: 700,
                  cursor: "pointer",
                }}
              >
                Move & done ✓
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
