export function SPill({ n, l, c, bg }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 5,
        background: bg,
        border: `1px solid ${c}33`,
        borderRadius: 20,
        padding: "3px 10px",
        flexShrink: 0,
      }}
    >
      <span style={{ fontSize: 13, fontWeight: 700, color: c }}>{n}</span>
      <span style={{ fontSize: 11, color: c, opacity: 0.8 }}>{l}</span>
    </div>
  );
}

export function Btn({ label, onClick, primary }) {
  return (
    <button
      className={primary ? "btn-p" : "btn-g"}
      onClick={onClick}
      style={{
        background: primary ? "var(--color-primary)" : "var(--bg-raised)",
        border: `1px solid ${primary ? "var(--color-primary)" : "var(--border)"}`,
        color: primary ? "#fff" : "var(--text-secondary)",
        padding: "8px 16px",
        borderRadius: 8,
        fontSize: 13,
        fontWeight: primary ? 600 : 400,
        cursor: "pointer",
        transition: "all .15s",
      }}
    >
      {label}
    </button>
  );
}

export function FL({ t }) {
  return <div style={{ fontSize: 11, color: "var(--text-faint)", marginBottom: 4, fontWeight: 500 }}>{t}</div>;
}

export function PTitle({ title, sub }) {
  return (
    <div style={{ marginBottom: 20 }}>
      <div style={{ fontSize: 22, fontWeight: 700, color: "var(--text-primary)" }}>{title}</div>
      {sub && <div style={{ fontSize: 13, color: "var(--text-faint)", marginTop: 2 }}>{sub}</div>}
    </div>
  );
}

export function CBtn({ id, copied, onCopy }) {
  return (
    <button
      onClick={onCopy}
      style={{
        background: copied === id ? "var(--color-success-bg)" : "var(--color-primary-light)",
        border: `1px solid ${copied === id ? "var(--color-success-border)" : "var(--color-primary-border)"}`,
        color: copied === id ? "var(--color-success-text)" : "var(--color-primary)",
        padding: "4px 12px",
        borderRadius: 6,
        fontSize: 11,
        fontWeight: 600,
        cursor: "pointer",
        transition: "all .15s",
      }}
    >
      {copied === id ? "Copied" : "Copy"}
    </button>
  );
}
