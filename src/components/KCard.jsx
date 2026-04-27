import { useState, useRef } from "react";
import { createPortal } from "react-dom";
import { DOC_LIST, FLAGS_OPT } from "../constants/data";
import { minutesUntil } from "../utils/date";
import { useTick } from "../hooks/useTick";
import { useTrucksStore } from "../store/useTrucksStore";

const FLAG_STYLES = {
  green: { background: "var(--color-success-bg)", color: "var(--color-success-text)", border: "1px solid var(--color-success-border)" },
  red:   { background: "var(--color-danger-bg)", color: "var(--color-danger-text)", border: "1px solid var(--color-danger-border)" },
  default: { background: "var(--bg-raised)", color: "var(--text-muted)", border: "1px solid var(--border)" },
};

export default function KCard({ driver, onClick, onDragStart, onDragEnd, isDragging }) {
  useTick();
  const [dlPreview, setDlPreview] = useState(null); // {x, y}
  const hoverTimer = useRef(null);

  const { trucks } = useTrucksStore();
  const assignedTruck = driver.assignedTruckId
    ? trucks.find((t) => t.id === driver.assignedTruckId)
    : null;

  const dlFile = (driver.files || []).find(f => f.linkedDoc === "Driver License");
  // Try thumbnail first, fall back to direct URL
  const dlThumbUrl = dlFile?.driveFileId
    ? `https://drive.google.com/thumbnail?id=${dlFile.driveFileId}&sz=w400`
    : (dlFile?.url || dlFile?.viewUrl || null);

  function handleMouseEnter(e) {
    if (!dlThumbUrl) return;
    hoverTimer.current = setTimeout(() => {
      const rect = e.currentTarget.getBoundingClientRect();
      setDlPreview({ x: rect.right + 8, y: rect.top });
    }, 300);
  }

  function handleMouseLeave() {
    clearTimeout(hoverTimer.current);
    setDlPreview(null);
  }

  const isDeadEnd = driver.stage === "trash" || driver.stage === "fired";
  const mins = !isDeadEnd ? minutesUntil(driver) : null;
  const over = mins !== null && mins < 0;
  const soon = mins !== null && mins >= 0 && mins <= 90;
  const docs = Object.values(driver.docs || {}).filter(Boolean).length;
  const intC =
    driver.interest === "Hot" ? "#ef4444" : driver.interest === "Warm" ? "#f59e0b" : "#94a3b8";

  let naLabel = null;
  let naTimeLabel = null;
  let naDayBadge = null;
  if (driver.nextAction) {
    const today = new Date(); today.setHours(0,0,0,0);
    const tomorrow = new Date(today); tomorrow.setDate(today.getDate() + 1);
    const dt = new Date(`${driver.nextAction}T00:00:00`);
    naLabel = dt.toLocaleDateString("en-US", { month: "short", day: "numeric" });
    naTimeLabel = driver.nextActionTime || null;
    if (dt.getTime() === today.getTime())    naDayBadge = "Today";
    else if (dt.getTime() === tomorrow.getTime()) naDayBadge = "Tomorrow";
  }

  return (
    <div
      className={`card-hover driver-card ${over ? "driver-card--overdue" : ""} ${soon ? "driver-card--soon" : ""} ${isDragging ? "driver-card-dragging" : ""}`}
      onClick={onClick}
      draggable
      onDragStart={(event) => onDragStart(event, driver.id)}
      onDragEnd={onDragEnd}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      <div className="driver-card__top">
        <div className="driver-card__name">{driver.name}</div>
        <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
          {dlThumbUrl && <span title="Driver License available — hover to preview" style={{ fontSize: 12, opacity: 0.6 }}>🪪</span>}
          <div className="driver-card__interest-dot" style={{ background: intC }} title={driver.interest} />
        </div>
      </div>
      <div className="driver-card__meta" style={{ display: "flex", alignItems: "center", gap: 5, flexWrap: "wrap" }}>
        <span>{driver.city} · {driver.exp}yr exp</span>
        {driver.source && driver.source !== "Other" && (
          <span style={{ fontSize: 9, fontWeight: 700, padding: "1px 5px", borderRadius: 3, background: driver.source === "Indeed" ? "#dbeafe" : "#ede9fe", color: driver.source === "Indeed" ? "#1d4ed8" : "#6d28d9", border: `1px solid ${driver.source === "Indeed" ? "#bfdbfe" : "#ddd6fe"}` }}>
            {driver.source}
          </span>
        )}
        {driver.jobType && (
          <span style={{
            fontSize: 9, fontWeight: 700, padding: "1px 5px", borderRadius: 3,
            background: driver.jobType === "Conestoga" ? "#d0f5ec" : "#fff7ed",
            color:      driver.jobType === "Conestoga" ? "#000000" : "#c2410c",
            border:     `1px solid ${driver.jobType === "Conestoga" ? "#8dd5c3" : "#fed7aa"}`,
          }}>
            {driver.jobType}
          </span>
        )}
        {driver.source === "Indeed" && driver.createdAt && (() => {
          const raw = String(driver.createdAt).slice(0, 10);
          const d = new Date(raw + "T00:00:00");
          if (isNaN(d)) return null;
          return <span style={{ fontSize: 9, color: "#94a3b8" }}>{d.toLocaleDateString("en-US", { month: "short", day: "numeric" })}</span>;
        })()}
      </div>

      {(driver.flags || []).length > 0 && (
        <div className="driver-card__flags">
          {(driver.flags || []).map((flag, idx) => {
            const type = FLAGS_OPT.find((f) => f.label === flag)?.type || "default";
            const style = FLAG_STYLES[type] || FLAG_STYLES.default;
            return (
              <span key={idx} className="driver-card__flag" style={style}>
                {flag}
              </span>
            );
          })}
        </div>
      )}

      <div className="driver-card__bottom-row">
        {driver.nextAction && !isDeadEnd ? (
          <div className="driver-card__next-action-wrap">
            <span
              className="driver-card__next-action-label"
              style={{ color: over ? "var(--color-danger)" : soon ? "var(--color-warning)" : "var(--text-muted)", fontWeight: over || soon ? 600 : 400 }}
            >
              {over
                ? `Overdue ${Math.abs(Math.round(mins / 60)) < 48 ? `${Math.abs(Math.round(mins / 60))}h` : `${Math.abs(Math.round(mins / 1440))}d`}`
                : soon && mins < 60
                  ? `In ${mins} min`
                  : `Next ${naLabel}`}
            </span>
            {naTimeLabel && !over && (
              <span
                className="driver-card__next-action-time"
                style={{
                  color: soon ? "var(--color-warning-text)" : "var(--text-secondary)",
                  background: soon ? "var(--color-warning-border)" : "var(--border)",
                  border: `1px solid ${soon ? "var(--color-warning)" : "var(--border-strong)"}`,
                  fontWeight: 700,
                }}
              >
                {naTimeLabel}
              </span>
            )}
            {naDayBadge && !over && (
              <span style={{
                fontSize: 10,
                fontWeight: 600,
                padding: "2px 6px",
                borderRadius: 5,
                background: naDayBadge === "Today" ? "var(--color-today-bg)" : "var(--color-tomorrow-bg)",
                color:      naDayBadge === "Today" ? "var(--color-today-text)" : "var(--color-tomorrow-text)",
                border:     `1px solid ${naDayBadge === "Today" ? "var(--color-today-border)" : "var(--color-tomorrow-border)"}`,
              }}>
                {naDayBadge}
              </span>
            )}
          </div>
        ) : (
          <span className="driver-card__empty-action">No action set</span>
        )}
        <span className="driver-card__docs-count">{docs}/{DOC_LIST.length}</span>
      </div>

      {/* DL hover preview — rendered in body to escape overflow:hidden */}
      {dlPreview && createPortal(
        <div style={{
          position: "fixed",
          left: Math.min(dlPreview.x, window.innerWidth - 230),
          top: Math.max(8, Math.min(dlPreview.y, window.innerHeight - 200)),
          zIndex: 9999,
          background: "#fff",
          border: "2px solid #e2e8f0",
          borderRadius: 10,
          boxShadow: "0 8px 32px rgba(0,0,0,.22)",
          overflow: "hidden",
          pointerEvents: "none",
          width: 220,
        }}>
          <img
            src={dlThumbUrl}
            alt="DL"
            style={{ width: "100%", display: "block", minHeight: 80 }}
            onError={e => { e.target.style.display = "none"; }}
          />
          <div style={{ padding: "6px 10px", fontSize: 11, color: "#64748b", fontWeight: 600 }}>
            🪪 Driver License
          </div>
        </div>,
        document.body
      )}

      {/* Trained by badge — only for Hired */}
      {driver.stage === "hired" && driver.trainedBy && (
        <div style={{ marginTop: 6 }}>
          <span style={{
            fontSize: 10,
            fontWeight: 600,
            padding: "2px 8px",
            borderRadius: 5,
            background: driver.trainedBy === "Trained by Bogdan" ? "var(--color-success-bg)" : "var(--color-danger-bg)",
            color: driver.trainedBy === "Trained by Bogdan" ? "var(--color-success-text)" : "var(--color-danger-text)",
            border: `1px solid ${driver.trainedBy === "Trained by Bogdan" ? "var(--color-success-border)" : "var(--color-danger-border)"}`,
          }}>
            {driver.trainedBy}
          </span>
        </div>
      )}

      {/* Insurance warning — only for hired drivers */}
      {driver.stage === "hired" && (!driver.insuranceStatus || driver.insuranceStatus === "none") && (
        <div style={{ marginTop: 5 }}>
          <span style={{ fontSize: 9, fontWeight: 700, padding: "2px 6px", borderRadius: 4, background: "#fef2f2", color: "#dc2626", border: "1px solid #fecaca" }}>
            ⚠ No Insurance
          </span>
        </div>
      )}

      {/* Truck unit badge — only for Hired drivers with assigned truck */}
      {driver.stage === "hired" && assignedTruck && (
        <div style={{ marginTop: 5 }}>
          <span style={{
            fontSize: 10,
            fontWeight: 700,
            padding: "2px 8px",
            borderRadius: 5,
            background: "#ccfbf1",
            color: "#0f766e",
            border: "1px solid #99f6e4",
          }}>
            Unit {assignedTruck.unitNumber}
          </span>
        </div>
      )}
    </div>
  );
}
