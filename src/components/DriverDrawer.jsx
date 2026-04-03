import { useRef, useState } from "react";
import { AVAILABILITY_OPTIONS, DOC_LIST, FLAGS_OPT, SOURCES, STAGES, TRUCK_TYPES } from "../constants/data";
import { fmtDate, minutesUntil } from "../utils/date";
import { fmtSize } from "../utils/file";
import { Btn, FL } from "./UiBits";

export default function DriverDrawer({ driver, onClose, onUpd, onNote, onFile, onDeleteFile, onStageChange, onDelete, canManageFiles }) {
  const [tab, setTab] = useState("info");
  const [note, setNote] = useState("");
  const [editing, setEditing] = useState(false);
  const [editData, setEditData] = useState({ ...driver });
  const [editingName, setEditingName] = useState(false);
  const [nameVal, setNameVal] = useState(driver.name);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [pendingFiles, setPendingFiles] = useState([]);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState({ current: 0, total: 0 });
  const [openDocPickerIndex, setOpenDocPickerIndex] = useState(null);
  const [deleteModal, setDeleteModal] = useState(null);
  const fileRef = useRef(null);

  const stage = STAGES.find((item) => item.id === driver.stage) || STAGES[0];
  const mins = minutesUntil(driver);
  const over = mins !== null && mins < 0;
  const isDeadEnd = driver.stage === "trash" || driver.stage === "fired";
  const docs = Object.values(driver.docs || {}).filter(Boolean).length;

  function saveInfo() {
    onUpd(driver.id, editData);
    setEditing(false);
  }

  function submitNote() {
    if (!note.trim()) return;
    onNote(driver.id, note.trim());
    setNote("");
  }

  function toggleDoc(doc) {
    onUpd(driver.id, { docs: { ...driver.docs, [doc]: !driver.docs?.[doc] } });
  }

  function toggleFlag(flag) {
    onUpd(driver.id, {
      flags: driver.flags.includes(flag)
        ? driver.flags.filter((value) => value !== flag)
        : [...driver.flags, flag],
    });
  }

  function handleFiles(files) {
    if (!canManageFiles || isUploading) return;

    const queuedFiles = Array.from(files).map((file) => ({
      name: file.name,
      type: file.type.startsWith("image/") ? "image" : "file",
      mime: file.type,
      data: null,
      rawFile: file,
      size: file.size,
      date: new Date().toLocaleString("en-US", {
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      }),
      linkedDoc: null,
    }));

    setPendingFiles((prev) => [...prev, ...queuedFiles]);
    if (fileRef.current) fileRef.current.value = "";
  }

  function setPendingFileDoc(index, linkedDoc) {
    setPendingFiles((prev) =>
      prev.map((file, idx) => (idx === index ? { ...file, linkedDoc: linkedDoc || null } : file)),
    );
    setOpenDocPickerIndex(null);
  }

  async function startUploadBatch() {
    if (!canManageFiles || isUploading || pendingFiles.length === 0) return;

    const queue = pendingFiles.map((file) => ({ ...file }));
    const nextDocs = { ...(driver.docs || {}) };

    setPendingFiles([]);
    setIsUploading(true);
    setUploadProgress({ current: 0, total: queue.length });

    try {
      for (let i = 0; i < queue.length; i += 1) {
        const file = queue[i];
        setUploadProgress({ current: i + 1, total: queue.length });
        await Promise.resolve(onFile(driver.id, file));
        if (file.linkedDoc) nextDocs[file.linkedDoc] = true;
      }

      const hasLinkedDocs = queue.some((file) => Boolean(file.linkedDoc));
      if (hasLinkedDocs) {
        onUpd(driver.id, { docs: nextDocs });
      }
    } finally {
      setIsUploading(false);
      setUploadProgress({ current: 0, total: 0 });
    }
  }

  function deleteFile(fileIdx) {
    if (!canManageFiles) return;
    const file = (driver.files || [])[fileIdx];
    if (!file) return;
    setDeleteModal({ idx: fileIdx, name: file.name || "file" });
  }

  function confirmDeleteFile() {
    if (!deleteModal) return;
    onDeleteFile(driver.id, deleteModal.idx);
    setDeleteModal(null);
  }

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 100, display: "flex" }} onClick={onClose}>
      <div style={{ flex: 1 }} />
      <div
        className="s-in"
        onClick={(event) => event.stopPropagation()}
        style={{
          width: 490,
          background: "var(--bg-surface)",
          borderLeft: "1px solid var(--border)",
          display: "flex",
          flexDirection: "column",
          height: "100%",
          boxShadow: "var(--shadow-drawer)",
        }}
      >
        <div style={{ padding: "18px 22px 14px", borderBottom: "1px solid var(--border)", flexShrink: 0 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
            <div style={{ flex: 1, minWidth: 0, marginRight: 8 }}>
              {editingName ? (
                <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                  <input
                    autoFocus
                    value={nameVal}
                    onChange={(e) => setNameVal(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") { onUpd(driver.id, { name: nameVal }); setEditingName(false); }
                      if (e.key === "Escape") { setNameVal(driver.name); setEditingName(false); }
                    }}
                    style={{ fontSize: 18, fontWeight: 700, border: "1.5px solid var(--border-focus)", borderRadius: 7, padding: "3px 8px", outline: "none", width: "100%", background: "var(--bg-raised)", color: "var(--text-primary)" }}
                  />
                  <button onClick={() => { onUpd(driver.id, { name: nameVal }); setEditingName(false); }}
                    style={{ padding: "4px 10px", background: "var(--color-primary)", color: "#fff", border: "none", borderRadius: 7, cursor: "pointer", fontSize: 12, fontWeight: 600 }}>Save</button>
                  <button onClick={() => { setNameVal(driver.name); setEditingName(false); }}
                    style={{ padding: "4px 8px", background: "var(--bg-hover)", color: "var(--text-muted)", border: "none", borderRadius: 7, cursor: "pointer", fontSize: 12 }}>✕</button>
                </div>
              ) : (
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <div style={{ fontSize: 20, fontWeight: 700, color: "var(--text-primary)" }}>{driver.name}</div>
                  <button onClick={() => { setNameVal(driver.name); setEditingName(true); }}
                    title="Edit name"
                    style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-faint)", fontSize: 13, padding: "2px 4px", borderRadius: 5 }}>✏️</button>
                </div>
              )}
              <div style={{ fontSize: 12, color: "var(--text-faint)", marginTop: 2 }}>
                {driver.city} · CDL {driver.cdl} · {driver.exp} yrs · {driver.source}
              </div>
            </div>
            <div style={{ display: "flex", gap: 6, alignItems: "center", flexShrink: 0 }}>
              <button
                onClick={() => setConfirmDelete(true)}
                title="Delete driver"
                style={{ background: "var(--color-danger-bg)", border: "1px solid var(--color-danger-border)", borderRadius: 8, width: 32, height: 32, cursor: "pointer", color: "var(--color-danger)", fontSize: 14, display: "flex", alignItems: "center", justifyContent: "center" }}
              >🗑</button>
            <button
              onClick={onClose}
              style={{
                background: "var(--bg-raised)",
                border: "1px solid var(--border)",
                borderRadius: 8,
                width: 32,
                height: 32,
                cursor: "pointer",
                color: "var(--text-muted)",
                fontSize: 15,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              x
            </button>
            </div>
          </div>

          {/* Confirm delete modal */}
          {confirmDelete && (
            <div style={{ position: "fixed", inset: 0, background: "var(--overlay)", zIndex: 3000, display: "flex", alignItems: "center", justifyContent: "center" }}>
              <div style={{ background: "var(--bg-surface)", borderRadius: 14, padding: 28, width: 340, boxShadow: "var(--shadow-lg)" }}>
                <div style={{ fontSize: 16, fontWeight: 700, color: "var(--text-primary)", marginBottom: 8 }}>Delete driver?</div>
                <div style={{ fontSize: 13, color: "var(--text-muted)", marginBottom: 20 }}>
                  Are you sure you want to permanently delete <b>{driver.name}</b>? This action cannot be undone.
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  <button onClick={() => setConfirmDelete(false)}
                    style={{ flex: 1, padding: "9px", background: "var(--bg-hover)", color: "var(--text-muted)", border: "none", borderRadius: 8, fontSize: 13, cursor: "pointer" }}>
                    Cancel
                  </button>
                  <button onClick={() => { onDelete(driver.id); onClose(); }}
                    style={{ flex: 1, padding: "9px", background: "var(--color-danger)", color: "#fff", border: "none", borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
                    Delete
                  </button>
                </div>
              </div>
            </div>
          )}

          <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 10 }}>
            <select
              value={driver.stage}
              onChange={(event) => onStageChange(driver.id, event.target.value)}
              style={{
                padding: "5px 10px",
                fontSize: 12,
                fontWeight: 600,
                background: stage.light,
                color: stage.color,
                border: `1px solid ${stage.color}55`,
                borderRadius: 7,
                outline: "none",
              }}
            >
              {STAGES.map((item) => (
                <option key={item.id} value={item.id}>{item.label}</option>
              ))}
            </select>
            <select
              value={driver.interest}
              onChange={(event) => onUpd(driver.id, { interest: event.target.value })}
              style={{
                padding: "5px 10px",
                fontSize: 12,
                background: "var(--bg-raised)",
                border: "1px solid var(--border)",
                borderRadius: 7,
                outline: "none",
                color: "var(--text-secondary)",
              }}
            >
              {["Hot", "Warm", "Cold"].map((value) => (
                <option key={value}>{value}</option>
              ))}
            </select>
          </div>

          {!isDeadEnd && (
          <div
            style={{
              background: over ? "var(--color-danger-bg)" : "var(--bg-raised)",
              border: `1px solid ${over ? "var(--color-danger-border)" : "var(--border)"}`,
              borderRadius: 9,
              padding: "10px 13px",
            }}
          >
            <div style={{ fontSize: 10, color: over ? "var(--color-danger)" : "var(--text-faint)", fontWeight: 700, letterSpacing: ".06em", marginBottom: 7 }}>
              {over ? "OVERDUE - NEXT ACTION" : "NEXT ACTION"}
            </div>
            <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
              <div>
                <div style={{ fontSize: 10, color: "var(--text-faint)", marginBottom: 3 }}>Date</div>
                <input
                  type="date"
                  value={driver.nextAction || ""}
                  onChange={(event) => onUpd(driver.id, { nextAction: event.target.value })}
                  style={{
                    padding: "7px 9px",
                    fontSize: 13,
                    background: "var(--bg-surface)",
                    border: `1px solid ${over ? "var(--color-danger-border)" : "var(--border)"}`,
                    borderRadius: 7,
                    color: over ? "var(--color-danger)" : "var(--text-secondary)",
                    outline: "none",
                  }}
                />
              </div>
              <div>
                <div style={{ fontSize: 10, color: "var(--text-faint)", marginBottom: 3 }}>Time</div>
                <input
                  type="time"
                  value={driver.nextActionTime || "10:00"}
                  onChange={(event) => onUpd(driver.id, { nextActionTime: event.target.value })}
                  style={{
                    padding: "7px 9px",
                    fontSize: 13,
                    background: "var(--bg-surface)",
                    border: "1px solid var(--border)",
                    borderRadius: 7,
                    color: "var(--text-secondary)",
                    outline: "none",
                  }}
                />
              </div>
              {!over && mins !== null && mins <= 120 && (
                <span style={{ fontSize: 11, color: "var(--color-warning)", fontWeight: 600, marginTop: 16 }}>
                  Due in {mins < 60 ? `${mins} min` : `${Math.round(mins / 60)} h`}
                </span>
              )}
            </div>
          </div>
          )}
        </div>

        <div style={{ display: "flex", borderBottom: "1px solid var(--border)", padding: "0 22px", flexShrink: 0 }}>
          {[
            ["info", "Info"],
            ["documents", "Documents"],
          ].map(([id, label]) => (
            <button
              key={id}
              className={`tab-btn ${tab === id ? "on" : ""}`}
              onClick={() => setTab(id)}
              style={{
                background: "none",
                border: "none",
                padding: "10px 11px 9px",
                fontSize: 13,
                color: tab === id ? "var(--color-primary)" : "var(--text-muted)",
                cursor: "pointer",
              }}
            >
              {label}
              {id === "documents" && (
                <span style={{ fontSize: 10, color: "var(--text-faint)", marginLeft: 3 }}>
                  ({docs}/{DOC_LIST.length}
                  {(driver.files || []).length > 0 ? ` · ${(driver.files || []).length} files` : ""})
                </span>
              )}
            </button>
          ))}
        </div>

        <div style={{ flex: 1, overflowY: "auto", padding: "16px 22px" }}>
          {tab === "info" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>

              {/* ── INFO ── */}
              {editing ? (
                <>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                    {[
                      ["name", "Full Name"],
                      ["phone", "Phone"],
                      ["email", "Email"],
                      ["city", "City / State"],
                    ].map(([key, label]) => (
                      <div key={key}>
                        <FL t={label} />
                        <input
                          value={editData[key] || ""}
                          onChange={(event) => {
                            let val = event.target.value;
                            if (key === "phone") {
                              const d = val.replace(/\D/g, "").slice(0, 10);
                              if (d.length <= 3) val = d;
                              else if (d.length <= 6) val = `(${d.slice(0,3)}) ${d.slice(3)}`;
                              else val = `(${d.slice(0,3)}) ${d.slice(3,6)}-${d.slice(6)}`;
                            }
                            setEditData((prev) => ({ ...prev, [key]: val }));
                          }}
                          style={{
                            width: "100%",
                            padding: "8px 10px",
                            fontSize: 13,
                            background: "var(--bg-raised)",
                            border: "1px solid var(--border)",
                            borderRadius: 7,
                            color: "var(--text-primary)",
                            outline: "none",
                          }}
                        />
                      </div>
                    ))}
                  </div>

                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                    <div>
                      <FL t="Exp (yrs)" />
                      <input
                        type="number"
                        value={editData.exp}
                        onChange={(event) => setEditData((prev) => ({ ...prev, exp: +event.target.value }))}
                        style={{ width: "100%", padding: "8px 10px", fontSize: 13, background: "var(--bg-raised)", border: "1px solid var(--border)", borderRadius: 7, color: "var(--text-primary)", outline: "none" }}
                      />
                    </div>
                    <div>
                      <FL t="Source" />
                      <select
                        value={editData.source}
                        onChange={(event) => setEditData((prev) => ({ ...prev, source: event.target.value }))}
                        style={{ width: "100%", padding: "8px 10px", fontSize: 13, background: "var(--bg-raised)", border: "1px solid var(--border)", borderRadius: 7, color: "var(--text-secondary)", outline: "none" }}
                      >
                        {SOURCES.map((source) => (
                          <option key={source}>{source}</option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div>
                    <FL t="Available" />
                    <select
                      value={editData.startDate || "TBD"}
                      onChange={(event) => setEditData((prev) => ({ ...prev, startDate: event.target.value }))}
                      style={{ width: "100%", padding: "8px 10px", fontSize: 13, background: "var(--bg-raised)", border: "1px solid var(--border)", borderRadius: 7, color: "var(--text-secondary)", outline: "none" }}
                    >
                      {AVAILABILITY_OPTIONS.map((opt) => (
                        <option key={opt}>{opt}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <FL t="Truck Type" />
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 4 }}>
                      {TRUCK_TYPES.map((type) => {
                        const checked = (editData.truckTypes || []).includes(type);
                        return (
                          <label key={type} style={{
                            display: "flex", alignItems: "center", gap: 5,
                            padding: "5px 10px", borderRadius: 6, cursor: "pointer",
                            fontSize: 12, fontWeight: 500,
                            background: checked ? "var(--color-primary-light)" : "var(--bg-raised)",
                            border: `1px solid ${checked ? "var(--color-primary-border)" : "var(--border)"}`,
                            color: checked ? "var(--color-primary-dark)" : "var(--text-muted)",
                            transition: "all .12s",
                          }}>
                            <input
                              type="checkbox"
                              checked={checked}
                              style={{ display: "none" }}
                              onChange={() => {
                                const prev = editData.truckTypes || [];
                                setEditData((d) => ({
                                  ...d,
                                  truckTypes: checked ? prev.filter((t) => t !== type) : [...prev, type],
                                }));
                              }}
                            />
                            {checked ? "✓ " : ""}{type}
                          </label>
                        );
                      })}
                    </div>
                  </div>

                  <div style={{ display: "flex", gap: 8 }}>
                    <Btn label="Save" onClick={saveInfo} primary />
                    <Btn label="Cancel" onClick={() => setEditing(false)} />
                  </div>
                </>
              ) : (
                <>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                    {[
                      ["Phone", driver.phone],
                      ["Email", driver.email],
                      ["City", driver.city],
                      ["Experience", `${driver.exp} years`],
                      ["Source", driver.source],
                      ...(driver.jobType ? [["Job Type", driver.jobType]] : []),
                      ["Available", driver.startDate || "TBD"],
                      ["Last Contact", driver.lastContact ? fmtDate(driver.lastContact) : "-"],
                      ...(driver.source === "Indeed" && driver.createdAt ? [["Applied on Indeed", fmtDate(driver.createdAt)]] : []),
                    ].map(([key, value]) => (
                      <div key={key} style={{ background: "var(--bg-raised)", border: "1px solid var(--border)", borderRadius: 8, padding: "9px 11px" }}>
                        <div style={{ fontSize: 10, color: "var(--text-faint)", marginBottom: 3, fontWeight: 500 }}>{key}</div>
                        <div style={{ fontSize: 13, color: "var(--text-primary)" }}>{value}</div>
                      </div>
                    ))}
                    <div style={{ gridColumn: "1 / -1", background: "var(--bg-raised)", border: "1px solid var(--border)", borderRadius: 8, padding: "9px 11px" }}>
                      <div style={{ fontSize: 10, color: "var(--text-faint)", marginBottom: 5, fontWeight: 500 }}>Truck Type</div>
                      {(driver.truckTypes || []).length === 0
                        ? <span style={{ fontSize: 13, color: "var(--text-disabled)" }}>—</span>
                        : <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                            {(driver.truckTypes || []).map((t) => (
                              <span key={t} style={{ fontSize: 12, fontWeight: 500, padding: "3px 8px", borderRadius: 5, background: "var(--color-primary-light)", color: "var(--color-primary-dark)", border: "1px solid var(--color-primary-border)" }}>{t}</span>
                            ))}
                          </div>
                      }
                    </div>
                  </div>
                  <Btn label="Edit Info" onClick={() => { setEditData({ ...driver }); setEditing(true); }} />
                </>
              )}

              {/* ── LOG ── */}
              <div style={{ borderTop: "1px solid var(--border)", paddingTop: 14, marginTop: 4 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: "var(--text-muted)", letterSpacing: ".06em", marginBottom: 10, textTransform: "uppercase" }}>
                  Log <span style={{ fontWeight: 400, color: "var(--text-faint)" }}>({driver.notes.length})</span>
                </div>
                <div>
                  <FL t="Add Entry" />
                  <textarea
                    value={note}
                    onChange={(event) => setNote(event.target.value)}
                    placeholder="Log a call, text, email or note"
                    rows={4}
                    style={{
                      width: "100%",
                      padding: "10px 12px",
                      fontSize: 13,
                      background: "var(--bg-raised)",
                      border: "1px solid var(--border)",
                      borderRadius: 8,
                      resize: "vertical",
                      lineHeight: 1.6,
                      color: "var(--text-primary)",
                      outline: "none",
                    }}
                  />
                  <div style={{ marginTop: 6 }}>
                    <Btn label="Add Entry" onClick={submitNote} primary />
                  </div>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 7, marginTop: 12 }}>
                  {driver.notes.length === 0 && (
                    <div style={{ textAlign: "center", padding: 24, fontSize: 13, color: "var(--text-disabled)" }}>No entries yet</div>
                  )}
                  {driver.notes.map((item, idx) => (
                    <div
                      key={idx}
                      style={{
                        background: "var(--bg-raised)",
                        border: `1px solid ${item.text.startsWith("[Stage:") ? "var(--color-primary-border)" : "var(--border)"}`,
                        borderRadius: 9,
                        padding: "10px 12px",
                      }}
                    >
                      <div style={{ fontSize: 10, color: "var(--text-faint)", marginBottom: 4 }}>{item.date}</div>
                      <div style={{ fontSize: 13, color: "var(--text-secondary)", lineHeight: 1.6, whiteSpace: "pre-wrap" }}>{item.text}</div>
                    </div>
                  ))}
                </div>
              </div>

              {/* ── FLAGS ── */}
              <div style={{ borderTop: "1px solid var(--border)", paddingTop: 14, marginTop: 4 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: "var(--text-muted)", letterSpacing: ".06em", marginBottom: 10, textTransform: "uppercase" }}>Flags</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
                  {FLAGS_OPT.map(({ label: flag, type }) => {
                    const isActive = driver.flags.includes(flag);
                    const isGreen = type === "green";
                    const activeBg     = isGreen ? "var(--color-success-bg)" : "var(--color-danger-bg)";
                    const activeBorder = isGreen ? "var(--color-success-border)" : "var(--color-danger-border)";
                    const checkColor   = isGreen ? "var(--color-success)" : "var(--color-danger)";
                    const idleBg       = "var(--bg-raised)";
                    const idleBorder   = "var(--border)";
                    return (
                      <label
                        key={flag}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 12,
                          padding: "11px 14px",
                          background: isActive ? activeBg : idleBg,
                          border: `1px solid ${isActive ? activeBorder : idleBorder}`,
                          borderRadius: 9,
                          cursor: "pointer",
                          transition: "all .12s",
                        }}
                      >
                        <div
                          style={{
                            width: 16,
                            height: 16,
                            borderRadius: 4,
                            border: `2px solid ${isActive ? checkColor : "var(--border-strong)"}`,
                            background: isActive ? checkColor : "transparent",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            flexShrink: 0,
                            transition: "all .15s",
                          }}
                        >
                          {isActive && <span style={{ color: "#fff", fontSize: 9, fontWeight: 700 }}>v</span>}
                        </div>
                        <input type="checkbox" checked={isActive} onChange={() => toggleFlag(flag)} style={{ display: "none" }} />
                        <span style={{ fontSize: 13, color: isActive ? checkColor : "var(--text-secondary)", fontWeight: isActive ? 600 : 400 }}>{flag}</span>
                      </label>
                    );
                  })}
                </div>
              </div>

              {/* ── INDEED QUALIFICATIONS ── */}
              {(driver.qualifications || []).length > 0 && (
                <div style={{ borderTop: "1px solid var(--border)", paddingTop: 14, marginTop: 4 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: "var(--text-muted)", letterSpacing: ".06em", marginBottom: 10, textTransform: "uppercase", display: "flex", alignItems: "center", gap: 7 }}>
                    <span style={{ fontSize: 9, background: "#dbeafe", color: "#1d4ed8", padding: "2px 6px", borderRadius: 3, fontWeight: 700 }}>INDEED</span>
                    Qualifications ({driver.qualifications.length})
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
                    {driver.qualifications.map((q, idx) => (
                      <div key={idx} style={{ background: "var(--bg-raised)", border: "1px solid var(--border)", borderRadius: 8, padding: "9px 12px" }}>
                        <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 3 }}>{q.question}</div>
                        <div style={{ fontSize: 13, color: "var(--text-primary)", fontWeight: 500, display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                          {q.answer}
                          {q.match === "Yes" && <span style={{ fontSize: 10, background: "#dcfce7", color: "#16a34a", padding: "1px 6px", borderRadius: 4, fontWeight: 600 }}>✓ Match</span>}
                          {q.match === "No" && <span style={{ fontSize: 10, background: "#fee2e2", color: "#dc2626", padding: "1px 6px", borderRadius: 4, fontWeight: 600 }}>✗ No match</span>}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

            </div>
          )}

          {tab === "documents" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
              <div>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
                  <span style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>Required Documents</span>
                  <span style={{ fontSize: 12, color: docs === DOC_LIST.length ? "var(--color-success)" : "var(--text-faint)", fontWeight: 500 }}>
                    {docs} / {DOC_LIST.length} received
                  </span>
                </div>
                <div style={{ background: "var(--bg-hover)", borderRadius: 4, height: 5, marginBottom: 12 }}>
                  <div
                    style={{
                      height: "100%",
                      width: `${(docs / DOC_LIST.length) * 100}%`,
                      background: docs === DOC_LIST.length ? "var(--color-success)" : "#3b82f6",
                      borderRadius: 4,
                      transition: "width .3s ease",
                    }}
                  />
                </div>
                <div style={{ background: "var(--bg-surface)", border: "1px solid var(--border)", borderRadius: 10, overflow: "hidden" }}>
                  {DOC_LIST.map((docItem, idx) => (
                    <label
                      key={docItem.name}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 12,
                        padding: "10px 14px",
                        borderBottom: idx < DOC_LIST.length - 1 ? "1px solid var(--bg-raised)" : "none",
                        cursor: "pointer",
                        background: driver.docs?.[docItem.name] ? "var(--color-success-bg)" : docItem.required ? "var(--color-warning-bg)" : "var(--bg-surface)",
                        transition: "background .12s",
                      }}
                    >
                      <div
                        style={{
                          width: 18,
                          height: 18,
                          borderRadius: 5,
                          border: `2px solid ${driver.docs?.[docItem.name] ? "var(--color-success)" : docItem.required ? "var(--color-warning)" : "var(--text-disabled)"}`,
                          background: driver.docs?.[docItem.name] ? "var(--color-success)" : "transparent",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          flexShrink: 0,
                          transition: "all .15s",
                        }}
                      >
                        {driver.docs?.[docItem.name] && <span style={{ color: "#fff", fontSize: 10, fontWeight: 700 }}>v</span>}
                      </div>
                      <input type="checkbox" checked={!!driver.docs?.[docItem.name]} onChange={() => toggleDoc(docItem.name)} style={{ display: "none" }} />
                      <span style={{ fontSize: 13, color: driver.docs?.[docItem.name] ? "var(--color-success-text)" : "var(--text-secondary)", flex: 1 }}>
                        {docItem.name}
                      </span>
                      {docItem.required && !driver.docs?.[docItem.name] && (
                        <span style={{ fontSize: 10, fontWeight: 700, color: "var(--color-warning)", background: "var(--color-warning-bg)", borderRadius: 5, padding: "2px 6px" }}>Required</span>
                      )}
                      {driver.docs?.[docItem.name] && <span style={{ fontSize: 10, color: "var(--color-success)", fontWeight: 600 }}>Received</span>}
                    </label>
                  ))}
                </div>
              </div>

              <div style={{ borderTop: "1px solid var(--border)" }} />

              <div>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
                  <span style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>Uploaded Files</span>
                  <span style={{ fontSize: 12, color: "var(--text-faint)" }}>
                    {(driver.files || []).length} file{(driver.files || []).length !== 1 ? "s" : ""}
                  </span>
                </div>
                {canManageFiles ? (
                  <div
                    className="file-zone"
                    onDragOver={(event) => {
                      if (isUploading) return;
                      event.preventDefault();
                    }}
                    onDrop={(event) => {
                      if (isUploading) return;
                      event.preventDefault();
                      handleFiles(event.dataTransfer.files);
                    }}
                    onClick={() => {
                      if (isUploading) return;
                      fileRef.current?.click();
                    }}
                    style={{
                      border: `2px dashed ${isUploading ? "var(--color-primary-border)" : "var(--border)"}`,
                      borderRadius: 10,
                      padding: "18px 16px",
                      textAlign: "center",
                      cursor: isUploading ? "wait" : "pointer",
                      transition: "all .15s",
                      background: isUploading ? "var(--color-primary-light)" : "var(--bg-subtle)",
                      marginBottom: 12,
                    }}
                  >
                    <div style={{ fontSize: 22, marginBottom: 6 }}>{isUploading ? "⏳" : "Upload"}</div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text-secondary)", marginBottom: 3 }}>
                      {isUploading
                        ? `Uploading ${uploadProgress.current}/${uploadProgress.total || 1}...`
                        : "Drop files or click to upload"}
                    </div>
                    <div style={{ fontSize: 11, color: "var(--text-faint)" }}>PDF, images, docs, spreadsheets</div>
                    <input ref={fileRef} type="file" multiple disabled={isUploading} onChange={(event) => handleFiles(event.target.files)} style={{ display: "none" }} />
                  </div>
                ) : (
                  <div
                    style={{
                      border: "1px solid var(--border)",
                      borderRadius: 10,
                      padding: "12px 14px",
                      fontSize: 12,
                      color: "var(--text-muted)",
                      background: "var(--bg-raised)",
                      marginBottom: 12,
                    }}
                  >
                    View only: only admin/root can upload or delete files.
                  </div>
                )}

                {(driver.files || []).length === 0 ? (
                  <div style={{ textAlign: "center", padding: "14px 0", fontSize: 13, color: "var(--text-disabled)" }}>No files uploaded yet</div>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
                    {(driver.files || []).map((file, idx) => (
                      <div key={idx} style={{ background: "var(--bg-raised)", border: "1px solid var(--border)", borderRadius: 9, overflow: "hidden" }}>
                        <div style={{ padding: "11px 14px", display: "flex", alignItems: "center", gap: 12 }}>
                          <div style={{ width: 34, height: 34, background: "var(--color-primary-light)", borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, flexShrink: 0, color: "var(--color-primary-dark)" }}>
                            {file.type === "image" ? "IMG" : "FILE"}
                          </div>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text-secondary)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{file.name}</div>
                            <div style={{ fontSize: 10, color: "var(--text-faint)", marginTop: 2 }}>
                              {fmtSize(file.size)} · {file.date}
                              {file.linkedDoc && <span style={{ marginLeft: 6, color: "var(--color-success)", fontWeight: 600 }}>· {file.linkedDoc}</span>}
                            </div>
                          </div>
                          <div style={{ display: "flex", gap: 8, alignItems: "center", flexShrink: 0 }}>
                            <a href={file.url || file.data} download={file.name} target="_blank" rel="noopener noreferrer" style={{ fontSize: 11, color: "var(--color-primary)", textDecoration: "none", fontWeight: 600 }}>Save</a>
                            {canManageFiles && <button onClick={() => deleteFile(idx)} style={{ background: "none", border: "none", color: "var(--color-danger)", fontSize: 12, cursor: "pointer" }}>Delete</button>}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

        </div>
      </div>

      {pendingFiles.length > 0 && !isUploading && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "var(--overlay)",
            zIndex: 200,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 20,
          }}
          onClick={() => setPendingFiles([])}
        >
          <div
            onClick={(event) => event.stopPropagation()}
            style={{
              background: "var(--bg-surface)",
              borderRadius: 16,
              width: "100%",
              maxWidth: 420,
              padding: 24,
              boxShadow: "var(--shadow-lg)",
            }}
          >
            <div style={{ fontSize: 16, fontWeight: 700, color: "var(--text-primary)", marginBottom: 4 }}>What document is this?</div>
            <div style={{ fontSize: 13, color: "var(--text-muted)", marginBottom: 16 }}>
              Choose required document type for each file first. Upload starts after you click Start upload.
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 14, maxHeight: 320, overflowY: "auto" }}>
              {pendingFiles.map((file, idx) => (
                <div key={`${file.name}-${idx}`} style={{ border: "1px solid var(--border)", borderRadius: 8, padding: "10px 12px", background: "var(--bg-raised)", position: "relative" }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)", marginBottom: 6, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                    {file.name}
                  </div>
                  <button
                    type="button"
                    onClick={() => setOpenDocPickerIndex((prev) => (prev === idx ? null : idx))}
                    style={{
                      width: "100%",
                      padding: "8px 10px",
                      fontSize: 12,
                      border: "1px solid var(--border-strong)",
                      borderRadius: 7,
                      background: "var(--bg-surface)",
                      color: "var(--text-secondary)",
                      outline: "none",
                      textAlign: "left",
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                    }}
                  >
                    <span>{file.linkedDoc || "Skip (no checklist link)"}</span>
                    <span style={{ color: "var(--text-faint)", fontSize: 11 }}>{openDocPickerIndex === idx ? "▲" : "▼"}</span>
                  </button>

                  {openDocPickerIndex === idx && (
                    <div
                      style={{
                        position: "absolute",
                        left: 12,
                        right: 12,
                        top: 64,
                        zIndex: 10,
                        border: "1px solid var(--border)",
                        borderRadius: 8,
                        background: "var(--bg-surface)",
                        boxShadow: "var(--shadow-md)",
                        maxHeight: 220,
                        overflowY: "auto",
                      }}
                    >
                      <button
                        type="button"
                        onClick={() => setPendingFileDoc(idx, null)}
                        style={{
                          width: "100%",
                          textAlign: "left",
                          padding: "9px 10px",
                          border: "none",
                          borderBottom: "1px solid var(--border)",
                          background: file.linkedDoc ? "var(--bg-surface)" : "var(--color-primary-light)",
                          color: "var(--text-secondary)",
                          cursor: "pointer",
                          fontSize: 12,
                        }}
                      >
                        Skip (no checklist link)
                      </button>

                      {DOC_LIST.map((docItem) => {
                        const isReceived = Boolean(driver.docs?.[docItem.name]);
                        const isSelected = file.linkedDoc === docItem.name;

                        return (
                          <button
                            key={docItem.name}
                            type="button"
                            onClick={() => setPendingFileDoc(idx, docItem.name)}
                            style={{
                              width: "100%",
                              textAlign: "left",
                              padding: "9px 10px",
                              border: "none",
                              borderTop: "1px solid var(--bg-raised)",
                              background: isSelected ? "var(--color-primary-light)" : "var(--bg-surface)",
                              color: "var(--text-secondary)",
                              cursor: "pointer",
                              fontSize: 12,
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "space-between",
                              gap: 8,
                            }}
                          >
                            <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{docItem.name}</span>
                            {docItem.required && <span style={{ fontSize: 10, color: "var(--color-warning)", fontWeight: 700, flexShrink: 0 }}>★</span>}
                            {isReceived && (
                              <span style={{ color: "var(--color-success)", fontSize: 11, fontWeight: 600 }}>✔</span>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              ))}
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button
                onClick={() => setPendingFiles([])}
                style={{
                  flex: 1,
                  padding: "10px",
                  background: "var(--bg-surface)",
                  border: "1px solid var(--border)",
                  borderRadius: 8,
                  fontSize: 13,
                  color: "var(--text-muted)",
                  cursor: "pointer",
                }}
              >
                Cancel
              </button>
              <button
                onClick={startUploadBatch}
                style={{
                  flex: 1,
                  padding: "10px",
                  background: "var(--color-primary)",
                  border: "1px solid var(--color-primary)",
                  borderRadius: 8,
                  fontSize: 13,
                  color: "#fff",
                  cursor: "pointer",
                  fontWeight: 600,
                }}
              >
                Start upload ({pendingFiles.length})
              </button>
            </div>
          </div>
        </div>
      )}

      {deleteModal && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "var(--overlay)",
            zIndex: 220,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 20,
          }}
          onClick={() => setDeleteModal(null)}
        >
          <div
            onClick={(event) => event.stopPropagation()}
            style={{
              background: "var(--bg-surface)",
              borderRadius: 16,
              width: "100%",
              maxWidth: 420,
              padding: 22,
              boxShadow: "var(--shadow-lg)",
              border: "1px solid var(--color-danger-border)",
            }}
          >
            <div style={{ fontSize: 16, fontWeight: 700, color: "var(--color-danger-text)", marginBottom: 6 }}>
              Delete file?
            </div>
            <div style={{ fontSize: 13, color: "var(--text-muted)", lineHeight: 1.5, marginBottom: 16 }}>
              File{" "}
              <span
                style={{
                  fontWeight: 600,
                  color: "var(--text-secondary)",
                  overflowWrap: "anywhere",
                  wordBreak: "break-word",
                }}
              >
                {deleteModal.name}
              </span>{" "}
              will be permanently removed from the driver profile and Google Drive.
            </div>

            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
              <button
                onClick={() => setDeleteModal(null)}
                style={{
                  padding: "9px 14px",
                  background: "var(--bg-raised)",
                  border: "1px solid var(--border)",
                  borderRadius: 8,
                  fontSize: 13,
                  color: "var(--text-muted)",
                  cursor: "pointer",
                }}
              >
                Cancel
              </button>
              <button
                onClick={confirmDeleteFile}
                style={{
                  padding: "9px 14px",
                  background: "var(--color-danger)",
                  border: "1px solid var(--color-danger)",
                  borderRadius: 8,
                  fontSize: 13,
                  fontWeight: 600,
                  color: "#fff",
                  cursor: "pointer",
                }}
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
