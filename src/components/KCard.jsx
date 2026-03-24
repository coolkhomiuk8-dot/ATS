import { DOC_LIST, FLAGS_OPT } from "../constants/data";
import { minutesUntil } from "../utils/date";
import { useTick } from "../hooks/useTick";

const FLAG_STYLES = {
  green: { background: "#dcfce7", color: "#15803d", border: "1px solid #bbf7d0" },
  red:   { background: "#fee2e2", color: "#b91c1c", border: "1px solid #fecaca" },
  default: { background: "#f8fafc", color: "#64748b", border: "1px solid #e2e8f0" },
};

export default function KCard({ driver, onClick, onDragStart, onDragEnd, isDragging }) {
  useTick(); // підписується на один глобальний інтервал

  const mins = minutesUntil(driver);
  const over = mins !== null && mins < 0;
  const soon = mins !== null && mins >= 0 && mins <= 90;
  const docs = Object.values(driver.docs || {}).filter(Boolean).length;
  const intC =
    driver.interest === "Hot" ? "#10b981" : driver.interest === "Warm" ? "#f59e0b" : "#94a3b8";

  let naLabel = null;
  let naTimeLabel = null;
  if (driver.nextAction) {
    const dt = new Date(`${driver.nextAction}T00:00:00`);
    naLabel = dt.toLocaleDateString("en-US", { month: "short", day: "numeric" });
    naTimeLabel = driver.nextActionTime || null;
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
      <div className="driver-card__meta">
        {driver.city} · CDL {driver.cdl} · {driver.exp}yr
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
        {driver.nextAction ? (
          <div className="driver-card__next-action-wrap">
            <span
              className="driver-card__next-action-label"
              style={{ color: over ? "#dc2626" : soon ? "#d97706" : "#64748b", fontWeight: over || soon ? 600 : 400 }}
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
                  color: soon ? "#d97706" : "#94a3b8",
                  background: soon ? "#fffbeb" : "#f8fafc",
                  border: `1px solid ${soon ? "#fde68a" : "#e2e8f0"}`,
                }}
              >
                {naTimeLabel}
              </span>
            )}
          </div>
        ) : (
          <span className="driver-card__empty-action">No action set</span>
        )}
        <span className="driver-card__docs-count">{docs}/{DOC_LIST.length}</span>
      </div>
    </div>
  );
}
