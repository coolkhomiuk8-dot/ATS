import { ROLE_COLORS, ENGLISH_COLORS } from "../constants/dispatcherData";

export default function DispatcherCard({ dispatcher, onClick, onDragStart }) {
  const roleStyle = ROLE_COLORS[dispatcher.role] || null;

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
        border: "1px solid #e2e8f0",
        borderRadius: 10,
        padding: "12px 14px",
        cursor: "grab",
        transition: "box-shadow .15s, border-color .15s, opacity .15s",
        boxShadow: "0 1px 3px rgba(0,0,0,.06)",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.boxShadow = "0 4px 12px rgba(0,0,0,.1)";
        e.currentTarget.style.borderColor = "#c7d2fe";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.boxShadow = "0 1px 3px rgba(0,0,0,.06)";
        e.currentTarget.style.borderColor = "#e2e8f0";
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
    </div>
  );
}
