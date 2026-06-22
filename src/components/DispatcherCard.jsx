import { ROLE_COLORS, ENGLISH_COLORS, STAGE_STALE_DAYS } from "../constants/dispatcherData";

/**
 * Days between a YYYY-MM-DD (or ISO) timestamp and now, integer floor.
 * Negative results clamp to 0 (handles minor clock skew between client/server).
 */
function daysSince(value) {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  const ms = Date.now() - d.getTime();
  return Math.max(0, Math.floor(ms / 86400000));
}

/** Short human-readable date — "3 Apr" / "12 Jun". Falls back to raw string. */
function fmtShortDate(value) {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

/** Pick badge colour by how far past the stage threshold the candidate is. */
function staleStyle(daysInStage, threshold) {
  if (threshold == null || daysInStage == null) return null;
  if (daysInStage <= threshold)       return { bg: "#f0fdf4", color: "#16a34a", border: "#bbf7d0" }; // fresh
  if (daysInStage <= threshold * 2)   return { bg: "#fefce8", color: "#a16207", border: "#fde68a" }; // warming
  if (daysInStage <= threshold * 4)   return { bg: "#fff7ed", color: "#c2410c", border: "#fdba74" }; // hot
  return { bg: "#fef2f2", color: "#b91c1c", border: "#fecaca" };                                     // forgotten
}

export default function DispatcherCard({ dispatcher, onClick, onDragStart }) {
  const roleStyle = ROLE_COLORS[dispatcher.role] || null;

  // Age in current stage. Fall back to createdAt if stage never changed.
  const stageAgeDays = daysSince(dispatcher.stageChangedAt || dispatcher.createdAt);
  const threshold = STAGE_STALE_DAYS[dispatcher.stage];
  const ageColors = staleStyle(stageAgeDays, threshold);
  const createdAtLabel = fmtShortDate(dispatcher.createdAt);

  return (
    <div
      draggable
      onClick={onClick}
      onDragStart={(e) => {
        e.dataTransfer.effectAllowed = "move";
        e.dataTransfer.setData("dispatcherId", dispatcher.id);
        onDragStart?.();
        e.currentTarget.style.opacity = "0.45";
      }}
      onDragEnd={(e) => {
        e.currentTarget.style.opacity = "1";
      }}
      style={{
        background: "#fff",
        // Stronger border + layered shadow so cards don't blend into the
        // slate-100 board background on lower-contrast displays.
        border: "1px solid #cbd5e1",
        borderRadius: 10,
        padding: "12px 14px",
        cursor: "grab",
        transition: "box-shadow .15s, border-color .15s, opacity .15s",
        boxShadow: "0 1px 2px rgba(15, 23, 42, 0.04), 0 2px 6px rgba(15, 23, 42, 0.08)",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.boxShadow = "0 2px 4px rgba(15, 23, 42, 0.06), 0 8px 20px rgba(15, 23, 42, 0.14)";
        e.currentTarget.style.borderColor = "#94a3b8";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.boxShadow = "0 1px 2px rgba(15, 23, 42, 0.04), 0 2px 6px rgba(15, 23, 42, 0.08)";
        e.currentTarget.style.borderColor = "#cbd5e1";
      }}
    >
      {/* Name + badges */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 6 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: "#0f172a" }}>{dispatcher.name || "—"}</div>
        <div style={{ display: "flex", gap: 4, flexShrink: 0 }}>
          {dispatcher.englishLevel && ENGLISH_COLORS[dispatcher.englishLevel] && (
            <span style={{
              fontSize: 10, fontWeight: 700,
              background: ENGLISH_COLORS[dispatcher.englishLevel].bg,
              color: ENGLISH_COLORS[dispatcher.englishLevel].color,
              border: `1px solid ${ENGLISH_COLORS[dispatcher.englishLevel].border}`,
              borderRadius: 20, padding: "2px 7px", whiteSpace: "nowrap",
            }}>{dispatcher.englishLevel}</span>
          )}
          {dispatcher.role && roleStyle && (
            <span style={{
              fontSize: 10, fontWeight: 700,
              background: roleStyle.bg, color: roleStyle.color,
              border: `1px solid ${roleStyle.border}`,
              borderRadius: 20, padding: "2px 8px", whiteSpace: "nowrap",
            }}>{dispatcher.role}</span>
          )}
        </div>
      </div>

      {/* Telegram */}
      {dispatcher.telegram && (
        <div style={{ fontSize: 11, color: "#2563eb", marginBottom: 3 }}>
          @{dispatcher.telegram.replace(/^@/, "")}
        </div>
      )}

      {/* Phone */}
      {dispatcher.phone && (
        <div style={{ fontSize: 11, color: "#64748b", marginBottom: 3 }}>{dispatcher.phone}</div>
      )}

      {/* Campaign */}
      {dispatcher.campaign && (
        <div style={{ fontSize: 10, color: "#a855f7", background: "#faf5ff", border: "1px solid #e9d5ff",
          borderRadius: 6, padding: "2px 7px", display: "inline-block", marginBottom: 4 }}>
          📢 {dispatcher.campaign}
        </div>
      )}

      {/* Note preview */}
      {dispatcher.note && (
        <div style={{
          fontSize: 11, color: "#94a3b8", marginTop: 5,
          whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
        }}>
          {dispatcher.note}
        </div>
      )}

      {/* Resume badge */}
      {dispatcher.resumeUrl && (
        <div style={{
          marginTop: 6, display: "inline-flex", alignItems: "center", gap: 4,
          fontSize: 10, color: "#059669",
          background: "#ecfdf5", border: "1px solid #a7f3d0",
          borderRadius: 6, padding: "2px 7px",
        }}>
          📄 Resume
        </div>
      )}

      {/* Footer row: when lead arrived + how long in current stage */}
      {(createdAtLabel || ageColors) && (
        <div style={{
          marginTop: 8, paddingTop: 7, borderTop: "1px dashed #e2e8f0",
          display: "flex", alignItems: "center", justifyContent: "space-between", gap: 6,
        }}>
          {createdAtLabel ? (
            <div style={{ fontSize: 10, color: "#94a3b8", whiteSpace: "nowrap" }}>
              📅 Лід: {createdAtLabel}
            </div>
          ) : <span />}
          {ageColors && stageAgeDays != null && (
            <div title={threshold != null
              ? `${stageAgeDays}d в стейджі (поріг ${threshold}d)`
              : `${stageAgeDays}d у стейджі`}
              style={{
                fontSize: 10, fontWeight: 700,
                background: ageColors.bg, color: ageColors.color,
                border: `1px solid ${ageColors.border}`,
                borderRadius: 20, padding: "1px 7px", whiteSpace: "nowrap",
              }}>
              ⏰ {stageAgeDays}d
            </div>
          )}
        </div>
      )}
    </div>
  );
}
