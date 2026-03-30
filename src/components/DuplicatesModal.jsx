import { useMemo, useState } from "react";
import { STAGES } from "../constants/data";

function normalizePhone(raw = "") {
  const digits = String(raw).replace(/\D/g, "");
  if ((digits.startsWith("1") || digits.startsWith("38")) && digits.length === 11) return digits.slice(1);
  if (digits.length === 12 && digits.startsWith("38")) return digits.slice(2);
  return digits.slice(-10);
}

export default function DuplicatesModal({ drivers = [], onDelete, onClose }) {
  // Group drivers by normalized phone — only groups with 2+
  const groups = useMemo(() => {
    const map = {};
    drivers.forEach((d) => {
      const norm = normalizePhone(d.phone || "");
      if (!norm || norm.length < 7) return; // skip empty / garbage phones
      if (!map[norm]) map[norm] = [];
      map[norm].push(d);
    });
    return Object.values(map).filter((g) => g.length > 1);
  }, [drivers]);

  // Pick the best driver to keep in a group:
  // 1. If any is "trash" — always keep that one (intentionally discarded)
  // 2. Otherwise — keep the one furthest in the funnel (highest STAGES index)
  function pickKeep(group) {
    const trashDriver = group.find((d) => d.stage === "trash");
    if (trashDriver) return trashDriver.id;
    let best = group[0];
    let bestIdx = STAGES.findIndex((s) => s.id === group[0].stage);
    group.forEach((d) => {
      const idx = STAGES.findIndex((s) => s.id === d.stage);
      if (idx > bestIdx) { best = d; bestIdx = idx; }
    });
    return best.id;
  }

  // keepId[groupIdx] = driverId to keep
  const [keepId, setKeepId] = useState(() =>
    Object.fromEntries(groups.map((g, i) => [i, pickKeep(g)]))
  );

  const [deleting, setDeleting] = useState(false);
  const [done, setDone] = useState(false);

  const totalToDelete = groups.reduce(
    (sum, g, i) => sum + g.filter((d) => d.id !== keepId[i]).length,
    0
  );

  async function handleDelete() {
    setDeleting(true);
    for (let i = 0; i < groups.length; i++) {
      const toDelete = groups[i].filter((d) => d.id !== keepId[i]);
      for (const d of toDelete) {
        await onDelete(d.id);
      }
    }
    setDeleting(false);
    setDone(true);
  }

  const stageName = (id) => STAGES.find((s) => s.id === id)?.label || id;
  const stageColor = (id) => STAGES.find((s) => s.id === id)?.color || "#94a3b8";

  return (
    <div
      style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,.55)", zIndex: 500, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}
      onClick={onClose}
    >
      <div
        style={{ background: "#fff", borderRadius: 16, width: "100%", maxWidth: 580, maxHeight: "88vh", display: "flex", flexDirection: "column", boxShadow: "0 24px 64px rgba(0,0,0,.22)" }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "18px 22px 14px", borderBottom: "1px solid #f1f5f9" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ fontSize: 22 }}>🔍</span>
            <div>
              <div style={{ fontSize: 16, fontWeight: 700, color: "#0f172a" }}>Find Duplicates</div>
              <div style={{ fontSize: 12, color: "#64748b" }}>Grouped by phone number</div>
            </div>
          </div>
          <button onClick={onClose} style={{ background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 7, width: 30, height: 30, cursor: "pointer", color: "#64748b", fontSize: 14 }}>✕</button>
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: "auto", padding: "18px 22px" }}>

          {done && (
            <div style={{ textAlign: "center", padding: "40px 0" }}>
              <div style={{ fontSize: 40, marginBottom: 12 }}>✅</div>
              <div style={{ fontSize: 16, fontWeight: 700, color: "#0f172a", marginBottom: 6 }}>Done!</div>
              <div style={{ fontSize: 13, color: "#64748b" }}>Duplicates have been removed.</div>
            </div>
          )}

          {!done && groups.length === 0 && (
            <div style={{ textAlign: "center", padding: "40px 0" }}>
              <div style={{ fontSize: 40, marginBottom: 12 }}>🎉</div>
              <div style={{ fontSize: 16, fontWeight: 700, color: "#0f172a", marginBottom: 6 }}>No duplicates found!</div>
              <div style={{ fontSize: 13, color: "#64748b" }}>All drivers have unique phone numbers.</div>
            </div>
          )}

          {!done && groups.map((group, gi) => (
            <div key={gi} style={{ marginBottom: 18 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: ".06em", marginBottom: 8 }}>
                {group[0].phone} · {group.length} duplicates
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {group.map((driver) => {
                  const isKeep = keepId[gi] === driver.id;
                  const autoReason = (() => {
                    if (!isKeep) return null;
                    if (driver.stage === "trash") return { label: "Trash/Cold", tip: "Always kept" };
                    const myIdx = STAGES.findIndex((s) => s.id === driver.stage);
                    const maxIdx = Math.max(...group.map((d) => STAGES.findIndex((s) => s.id === d.stage)));
                    if (myIdx === maxIdx && group.some((d) => d.id !== driver.id)) return { label: "Furthest in funnel", tip: "Auto-selected" };
                    return null;
                  })();
                  return (
                    <div
                      key={driver.id}
                      onClick={() => setKeepId((prev) => ({ ...prev, [gi]: driver.id }))}
                      style={{
                        display: "flex", alignItems: "center", gap: 12,
                        padding: "11px 14px",
                        border: `2px solid ${isKeep ? "#22c55e" : "#e2e8f0"}`,
                        borderRadius: 10,
                        background: isKeep ? "#f0fdf4" : "#fafafa",
                        cursor: "pointer",
                        transition: "all .15s",
                      }}
                    >
                      {/* Radio */}
                      <div style={{
                        width: 18, height: 18, borderRadius: "50%", flexShrink: 0,
                        border: `2px solid ${isKeep ? "#22c55e" : "#d1d5db"}`,
                        background: isKeep ? "#22c55e" : "transparent",
                        display: "flex", alignItems: "center", justifyContent: "center",
                      }}>
                        {isKeep && <div style={{ width: 7, height: 7, borderRadius: "50%", background: "#fff" }} />}
                      </div>

                      {/* Info */}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                          <span style={{ fontSize: 13, fontWeight: 700, color: "#0f172a" }}>{driver.name}</span>
                          <span style={{
                            fontSize: 10, fontWeight: 600, padding: "1px 7px", borderRadius: 20,
                            background: stageColor(driver.stage) + "22",
                            color: stageColor(driver.stage),
                          }}>
                            {stageName(driver.stage)}
                          </span>
                          {driver.source === "Indeed" && (
                            <span style={{ fontSize: 10, background: "#fef3c7", color: "#92400e", padding: "1px 6px", borderRadius: 4, fontWeight: 600 }}>Indeed</span>
                          )}
                          {isKeep && (
                            <span style={{ fontSize: 10, background: "#dcfce7", color: "#16a34a", padding: "1px 7px", borderRadius: 4, fontWeight: 700 }}>KEEP</span>
                          )}
                          {isKeep && autoReason && (
                            <span style={{ fontSize: 10, background: "#e0f2fe", color: "#0369a1", padding: "1px 6px", borderRadius: 4, fontWeight: 600 }} title={autoReason.tip}>
                              ✦ {autoReason.label}
                            </span>
                          )}
                          {!isKeep && (
                            <span style={{ fontSize: 10, background: "#fee2e2", color: "#dc2626", padding: "1px 7px", borderRadius: 4, fontWeight: 700 }}>DELETE</span>
                          )}
                        </div>
                        <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 2 }}>
                          Added: {driver.createdAt || "—"} · {driver.city || "—"}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>

        {/* Footer */}
        {!done && groups.length > 0 && (
          <div style={{ padding: "14px 22px", borderTop: "1px solid #f1f5f9", display: "flex", gap: 10, alignItems: "center" }}>
            <div style={{ flex: 1, fontSize: 12, color: "#64748b" }}>
              {totalToDelete} driver{totalToDelete !== 1 ? "s" : ""} will be deleted · {groups.length} group{groups.length !== 1 ? "s" : ""}
            </div>
            <button
              onClick={handleDelete}
              disabled={deleting || totalToDelete === 0}
              style={{
                padding: "10px 22px", borderRadius: 9, border: "none",
                background: deleting || totalToDelete === 0 ? "#e2e8f0" : "#ef4444",
                color: deleting || totalToDelete === 0 ? "#94a3b8" : "#fff",
                fontSize: 13, fontWeight: 700, cursor: deleting || totalToDelete === 0 ? "default" : "pointer",
              }}
            >
              {deleting ? "Deleting…" : `Delete ${totalToDelete} duplicate${totalToDelete !== 1 ? "s" : ""}`}
            </button>
            <button onClick={onClose} style={{ padding: "10px 18px", borderRadius: 9, border: "1px solid #e2e8f0", background: "#f8fafc", color: "#374151", fontSize: 13, cursor: "pointer" }}>
              Cancel
            </button>
          </div>
        )}
        {done && (
          <div style={{ padding: "14px 22px", borderTop: "1px solid #f1f5f9", display: "flex", justifyContent: "flex-end" }}>
            <button onClick={onClose} style={{ padding: "10px 22px", borderRadius: 9, border: "none", background: "#22c55e", color: "#fff", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
              Close
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
