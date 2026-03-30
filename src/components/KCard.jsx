import { DOC_LIST, FLAGS_OPT } from "../constants/data";
import { minutesUntil } from "../utils/date";
import { useTick } from "../hooks/useTick";

const FLAG_STYLES = {
  green: { background: "var(--color-success-bg)", color: "var(--color-success-text)", border: "1px solid var(--color-success-border)" },
  red:   { background: "var(--color-danger-bg)", color: "var(--color-danger-text)", border: "1px solid var(--color-danger-border)" },
  default: { background: "var(--bg-raised)", color: "var(--text-muted)", border: "1px solid var(--border)" },
};

export default function KCard({ driver, onClick, onDragStart, onDragEnd, isDragging }) {
  useTick();

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
    >
      <div className="driver-card__top">
        <div className="driver-card__name">{driver.name}</div>
        <div className="driver-card__interest-dot" style={{ background: intC }} title={driver.interest} />
      </div>
      <div className="driver-card__meta" style={{ display: "flex", alignItems: "center", gap: 5, flexWrap: "wrap" }}>
        <span>{driver.city} · {driver.exp}yr exp</span>
        {driver.source && driver.source !== "Other" && (
          <span style={{ fontSize: 9, fontWeight: 700, padding: "1px 5px", borderRadius: 3, background: driver.source === "Indeed" ? "#dbeafe" : "#ede9fe", color: driver.source === "Indeed" ? "#1d4ed8" : "#6d28d9", border: `1px solid ${driver.source === "Indeed" ? "#bfdbfe" : "#ddd6fe"}` }}>
            {driver.source}
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
    </div>
  );
}
