import { useRef, useState } from "react";
import { DOC_LIST, FLAGS_OPT, SOURCES, STAGES } from "../constants/data";
import { fmtDate, minutesUntil } from "../utils/date";
import { fmtSize } from "../utils/file";
import { Btn, FL } from "./UiBits";

export default function DriverDrawer({ driver, onClose, onUpd, onNote, onFile, onDeleteFile, onStageChange }) {
  const [tab, setTab] = useState("info");
  const [note, setNote] = useState("");
  const [editing, setEditing] = useState(false);
  const [editData, setEditData] = useState({ ...driver });
  const [pendingFile, setPendingFile] = useState(null);
  const [deleteModal, setDeleteModal] = useState(null);
  const fileRef = useRef(null);

  const stage = STAGES.find((item) => item.id === driver.stage) || STAGES[0];
  const mins = minutesUntil(driver);
  const over = mins !== null && mins < 0;
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
    Array.from(files).forEach((file) => {
      const reader = new FileReader();
      reader.onload = (event) => {
        setPendingFile({
          name: file.name,
          type: file.type.startsWith("image/") ? "image" : "file",
          mime: file.type,
          data: event.target.result,
          rawFile: file,
          size: file.size,
          date: new Date().toLocaleString("en-US", {
            month: "short",
            day: "numeric",
            hour: "2-digit",
            minute: "2-digit",
          }),
          linkedDoc: null,
        });
      };
      reader.readAsDataURL(file);
    });
  }

  function confirmPendingFile(linkedDoc) {
    if (!pendingFile) return;

    onFile(driver.id, { ...pendingFile, linkedDoc });
    if (linkedDoc) {
      onUpd(driver.id, { docs: { ...driver.docs, [linkedDoc]: true } });
    }
    setPendingFile(null);
  }

  function deleteFile(fileIdx) {
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
          background: "#fff",
          borderLeft: "1px solid #e2e8f0",
          display: "flex",
          flexDirection: "column",
          height: "100%",
          boxShadow: "-8px 0 40px rgba(0,0,0,.10)",
        }}
      >
        <div style={{ padding: "18px 22px 14px", borderBottom: "1px solid #f1f5f9", flexShrink: 0 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
            <div>
              <div style={{ fontSize: 20, fontWeight: 700, color: "#0f172a" }}>{driver.name}</div>
              <div style={{ fontSize: 12, color: "#94a3b8", marginTop: 2 }}>
                {driver.city} · CDL {driver.cdl} · {driver.exp} yrs · {driver.source}
              </div>
            </div>
            <button
              onClick={onClose}
              style={{
                background: "#f8fafc",
                border: "1px solid #e2e8f0",
                borderRadius: 8,
                width: 32,
                height: 32,
                cursor: "pointer",
                color: "#64748b",
                fontSize: 15,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              x
            </button>
          </div>

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
                background: "#f8fafc",
                border: "1px solid #e2e8f0",
                borderRadius: 7,
                outline: "none",
                color: "#374151",
              }}
            >
              {["Hot", "Warm", "Cold"].map((value) => (
                <option key={value}>{value}</option>
              ))}
            </select>
          </div>

          <div
            style={{
              background: over ? "#fef2f2" : "#f8fafc",
              border: `1px solid ${over ? "#fca5a5" : "#e2e8f0"}`,
              borderRadius: 9,
              padding: "10px 13px",
            }}
          >
            <div style={{ fontSize: 10, color: over ? "#dc2626" : "#94a3b8", fontWeight: 700, letterSpacing: ".06em", marginBottom: 7 }}>
              {over ? "OVERDUE - NEXT ACTION" : "NEXT ACTION"}
            </div>
            <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
              <div>
                <div style={{ fontSize: 10, color: "#94a3b8", marginBottom: 3 }}>Date</div>
                <input
                  type="date"
                  value={driver.nextAction || ""}
                  onChange={(event) => onUpd(driver.id, { nextAction: event.target.value })}
                  style={{
                    padding: "7px 9px",
                    fontSize: 13,
                    background: "#fff",
                    border: `1px solid ${over ? "#fca5a5" : "#e2e8f0"}`,
                    borderRadius: 7,
                    color: over ? "#dc2626" : "#374151",
                    outline: "none",
                  }}
                />
              </div>
              <div>
                <div style={{ fontSize: 10, color: "#94a3b8", marginBottom: 3 }}>Time</div>
                <input
                  type="time"
                  value={driver.nextActionTime || "10:00"}
                  onChange={(event) => onUpd(driver.id, { nextActionTime: event.target.value })}
                  style={{
                    padding: "7px 9px",
                    fontSize: 13,
                    background: "#fff",
                    border: "1px solid #e2e8f0",
                    borderRadius: 7,
                    color: "#374151",
                    outline: "none",
                  }}
                />
              </div>
              {!over && mins !== null && mins <= 120 && (
                <span style={{ fontSize: 11, color: "#d97706", fontWeight: 600, marginTop: 16 }}>
                  Due in {mins < 60 ? `${mins} min` : `${Math.round(mins / 60)} h`}
                </span>
              )}
            </div>
          </div>
        </div>

        <div style={{ display: "flex", borderBottom: "1px solid #f1f5f9", padding: "0 22px", flexShrink: 0 }}>
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
                color: tab === id ? "#2563eb" : "#64748b",
                cursor: "pointer",
              }}
            >
              {label}
              {id === "documents" && (
                <span style={{ fontSize: 10, color: "#94a3b8", marginLeft: 3 }}>
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
                          onChange={(event) => setEditData((prev) => ({ ...prev, [key]: event.target.value }))}
                          style={{
                            width: "100%",
                            padding: "8px 10px",
                            fontSize: 13,
                            background: "#f8fafc",
                            border: "1px solid #e2e8f0",
                            borderRadius: 7,
                            color: "#0f172a",
                            outline: "none",
                          }}
                        />
                      </div>
                    ))}
                  </div>

                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
                    <div>
                      <FL t="CDL" />
                      <select
                        value={editData.cdl}
                        onChange={(event) => setEditData((prev) => ({ ...prev, cdl: event.target.value }))}
                        style={{ width: "100%", padding: "8px 10px", fontSize: 13, background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 7, color: "#374151", outline: "none" }}
                      >
                        <option>A</option>
                        <option>B</option>
                      </select>
                    </div>
                    <div>
                      <FL t="Exp (yrs)" />
                      <input
                        type="number"
                        value={editData.exp}
                        onChange={(event) => setEditData((prev) => ({ ...prev, exp: +event.target.value }))}
                        style={{ width: "100%", padding: "8px 10px", fontSize: 13, background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 7, color: "#0f172a", outline: "none" }}
                      />
                    </div>
                    <div>
                      <FL t="Source" />
                      <select
                        value={editData.source}
                        onChange={(event) => setEditData((prev) => ({ ...prev, source: event.target.value }))}
                        style={{ width: "100%", padding: "8px 10px", fontSize: 13, background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 7, color: "#374151", outline: "none" }}
                      >
                        {SOURCES.map((source) => (
                          <option key={source}>{source}</option>
                        ))}
                      </select>
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
                      ["CDL", `Class ${driver.cdl}`],
                      ["Experience", `${driver.exp} years`],
                      ["Source", driver.source],
                      ["Available", driver.startDate || "TBD"],
                      ["Last Contact", driver.lastContact ? fmtDate(driver.lastContact) : "-"],
                    ].map(([key, value]) => (
                      <div key={key} style={{ background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 8, padding: "9px 11px" }}>
                        <div style={{ fontSize: 10, color: "#94a3b8", marginBottom: 3, fontWeight: 500 }}>{key}</div>
                        <div style={{ fontSize: 13, color: "#0f172a" }}>{value}</div>
                      </div>
                    ))}
                  </div>
                  <Btn label="Edit Info" onClick={() => { setEditData({ ...driver }); setEditing(true); }} />
                </>
              )}

              {/* ── LOG ── */}
              <div style={{ borderTop: "1px solid #f1f5f9", paddingTop: 14, marginTop: 4 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: "#64748b", letterSpacing: ".06em", marginBottom: 10, textTransform: "uppercase" }}>
                  Log <span style={{ fontWeight: 400, color: "#94a3b8" }}>({driver.notes.length})</span>
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
                      background: "#f8fafc",
                      border: "1px solid #e2e8f0",
                      borderRadius: 8,
                      resize: "vertical",
                      lineHeight: 1.6,
                      color: "#0f172a",
                      outline: "none",
                    }}
                  />
                  <div style={{ marginTop: 6 }}>
                    <Btn label="Add Entry" onClick={submitNote} primary />
                  </div>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 7, marginTop: 12 }}>
                  {driver.notes.length === 0 && (
                    <div style={{ textAlign: "center", padding: 24, fontSize: 13, color: "#cbd5e1" }}>No entries yet</div>
                  )}
                  {driver.notes.map((item, idx) => (
                    <div
                      key={idx}
                      style={{
                        background: "#f8fafc",
                        border: `1px solid ${item.text.startsWith("[Stage:") ? "#dbeafe" : "#e2e8f0"}`,
                        borderRadius: 9,
                        padding: "10px 12px",
                      }}
                    >
                      <div style={{ fontSize: 10, color: "#94a3b8", marginBottom: 4 }}>{item.date}</div>
                      <div style={{ fontSize: 13, color: "#374151", lineHeight: 1.6, whiteSpace: "pre-wrap" }}>{item.text}</div>
                    </div>
                  ))}
                </div>
              </div>

              {/* ── FLAGS ── */}
              <div style={{ borderTop: "1px solid #f1f5f9", paddingTop: 14, marginTop: 4 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: "#64748b", letterSpacing: ".06em", marginBottom: 10, textTransform: "uppercase" }}>Flags</div>
                <div style={{ fontSize: 12, color: "#94a3b8", marginBottom: 8 }}>Toggle risk flags for this driver</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
                  {FLAGS_OPT.map((flag) => (
                    <label
                      key={flag}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 12,
                        padding: "11px 14px",
                        background: driver.flags.includes(flag) ? "#f0f9ff" : "#f8fafc",
                        border: `1px solid ${driver.flags.includes(flag) ? "#bae6fd" : "#e2e8f0"}`,
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
                          border: `2px solid ${driver.flags.includes(flag) ? "#3b82f6" : "#d1d5db"}`,
                          background: driver.flags.includes(flag) ? "#3b82f6" : "transparent",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          flexShrink: 0,
                          transition: "all .15s",
                        }}
                      >
                        {driver.flags.includes(flag) && <span style={{ color: "#fff", fontSize: 9, fontWeight: 700 }}>v</span>}
                      </div>
                      <input type="checkbox" checked={driver.flags.includes(flag)} onChange={() => toggleFlag(flag)} style={{ display: "none" }} />
                      <span style={{ fontSize: 13, color: "#374151" }}>{flag}</span>
                    </label>
                  ))}
                </div>
              </div>

            </div>
          )}

          {tab === "documents" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
              <div>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
                  <span style={{ fontSize: 13, fontWeight: 600, color: "#0f172a" }}>Required Documents</span>
                  <span style={{ fontSize: 12, color: docs === DOC_LIST.length ? "#16a34a" : "#94a3b8", fontWeight: 500 }}>
                    {docs} / {DOC_LIST.length} received
                  </span>
                </div>
                <div style={{ background: "#f1f5f9", borderRadius: 4, height: 5, marginBottom: 12 }}>
                  <div
                    style={{
                      height: "100%",
                      width: `${(docs / DOC_LIST.length) * 100}%`,
                      background: docs === DOC_LIST.length ? "#10b981" : "#3b82f6",
                      borderRadius: 4,
                      transition: "width .3s ease",
                    }}
                  />
                </div>
                <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 10, overflow: "hidden" }}>
                  {DOC_LIST.map((doc, idx) => (
                    <label
                      key={doc}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 12,
                        padding: "10px 14px",
                        borderBottom: idx < DOC_LIST.length - 1 ? "1px solid #f8fafc" : "none",
                        cursor: "pointer",
                        background: driver.docs?.[doc] ? "#f0fdf4" : "#fff",
                        transition: "background .12s",
                      }}
                    >
                      <div
                        style={{
                          width: 18,
                          height: 18,
                          borderRadius: 5,
                          border: `2px solid ${driver.docs?.[doc] ? "#10b981" : "#d1d5db"}`,
                          background: driver.docs?.[doc] ? "#10b981" : "transparent",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          flexShrink: 0,
                          transition: "all .15s",
                        }}
                      >
                        {driver.docs?.[doc] && <span style={{ color: "#fff", fontSize: 10, fontWeight: 700 }}>v</span>}
                      </div>
                      <input type="checkbox" checked={!!driver.docs?.[doc]} onChange={() => toggleDoc(doc)} style={{ display: "none" }} />
                      <span style={{ fontSize: 13, color: driver.docs?.[doc] ? "#166534" : "#374151", flex: 1 }}>{doc}</span>
                      {driver.docs?.[doc] && <span style={{ fontSize: 10, color: "#10b981", fontWeight: 600 }}>Received</span>}
                    </label>
                  ))}
                </div>
              </div>

              <div style={{ borderTop: "1px solid #f1f5f9" }} />

              <div>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
                  <span style={{ fontSize: 13, fontWeight: 600, color: "#0f172a" }}>Uploaded Files</span>
                  <span style={{ fontSize: 12, color: "#94a3b8" }}>
                    {(driver.files || []).length} file{(driver.files || []).length !== 1 ? "s" : ""}
                  </span>
                </div>
                <div
                  className="file-zone"
                  onDragOver={(event) => event.preventDefault()}
                  onDrop={(event) => {
                    event.preventDefault();
                    handleFiles(event.dataTransfer.files);
                  }}
                  onClick={() => fileRef.current?.click()}
                  style={{
                    border: "2px dashed #e2e8f0",
                    borderRadius: 10,
                    padding: "18px 16px",
                    textAlign: "center",
                    cursor: "pointer",
                    transition: "all .15s",
                    background: "#fafafa",
                    marginBottom: 12,
                  }}
                >
                  <div style={{ fontSize: 22, marginBottom: 6 }}>Upload</div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: "#374151", marginBottom: 3 }}>Drop files or click to upload</div>
                  <div style={{ fontSize: 11, color: "#94a3b8" }}>PDF, images, docs, spreadsheets</div>
                  <input ref={fileRef} type="file" multiple onChange={(event) => handleFiles(event.target.files)} style={{ display: "none" }} />
                </div>

                {(driver.files || []).length === 0 ? (
                  <div style={{ textAlign: "center", padding: "14px 0", fontSize: 13, color: "#cbd5e1" }}>No files uploaded yet</div>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
                    {(driver.files || []).map((file, idx) => (
                      <div key={idx} style={{ background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 9, overflow: "hidden" }}>
                        {file.type === "image" ? (
                          <>
                            <img src={file.url || file.data} alt={file.name} style={{ width: "100%", maxHeight: 160, objectFit: "cover", display: "block" }} />
                            <div style={{ padding: "8px 12px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                              <div>
                                <div style={{ fontSize: 12, fontWeight: 600, color: "#374151" }}>{file.name}</div>
                                <div style={{ fontSize: 10, color: "#94a3b8" }}>
                                  {fmtSize(file.size)} · {file.date}
                                  {file.linkedDoc && <span style={{ marginLeft: 6, color: "#10b981", fontWeight: 600 }}>· {file.linkedDoc}</span>}
                                </div>
                              </div>
                              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                                <a href={file.url || file.data} download={file.name} target="_blank" rel="noopener noreferrer" style={{ fontSize: 11, color: "#2563eb", textDecoration: "none", fontWeight: 600 }}>Save</a>
                                <button onClick={() => deleteFile(idx)} style={{ background: "none", border: "none", color: "#dc2626", fontSize: 12, cursor: "pointer" }}>Delete</button>
                              </div>
                            </div>
                          </>
                        ) : (
                          <div style={{ padding: "11px 14px", display: "flex", alignItems: "center", gap: 12 }}>
                            <div style={{ width: 34, height: 34, background: "#eff6ff", borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, flexShrink: 0 }}>FILE</div>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ fontSize: 13, fontWeight: 600, color: "#374151", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{file.name}</div>
                              <div style={{ fontSize: 10, color: "#94a3b8", marginTop: 2 }}>
                                {fmtSize(file.size)} · {file.date}
                                {file.linkedDoc && <span style={{ marginLeft: 6, color: "#10b981", fontWeight: 600 }}>· {file.linkedDoc}</span>}
                              </div>
                            </div>
                            <div style={{ display: "flex", gap: 8, alignItems: "center", flexShrink: 0 }}>
                              <a href={file.url || file.data} download={file.name} target="_blank" rel="noopener noreferrer" style={{ fontSize: 11, color: "#2563eb", textDecoration: "none", fontWeight: 600 }}>Save</a>
                              <button onClick={() => deleteFile(idx)} style={{ background: "none", border: "none", color: "#dc2626", fontSize: 12, cursor: "pointer" }}>Delete</button>
                            </div>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

        </div>
      </div>

      {pendingFile && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(15,23,42,.55)",
            zIndex: 200,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 20,
          }}
          onClick={() => setPendingFile(null)}
        >
          <div
            onClick={(event) => event.stopPropagation()}
            style={{
              background: "#fff",
              borderRadius: 16,
              width: "100%",
              maxWidth: 420,
              padding: 24,
              boxShadow: "0 20px 60px rgba(0,0,0,.2)",
            }}
          >
            <div style={{ fontSize: 16, fontWeight: 700, color: "#0f172a", marginBottom: 4 }}>What document is this?</div>
            <div style={{ fontSize: 13, color: "#64748b", marginBottom: 16 }}>
              <span style={{ fontWeight: 600, color: "#374151" }}>{pendingFile.name}</span> - select a type to auto-check the list, or skip.
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 14, maxHeight: 320, overflowY: "auto" }}>
              {DOC_LIST.map((doc) => (
                <button
                  key={doc}
                  onClick={() => confirmPendingFile(doc)}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    padding: "10px 14px",
                    background: driver.docs?.[doc] ? "#f0fdf4" : "#f8fafc",
                    border: `1px solid ${driver.docs?.[doc] ? "#6ee7b7" : "#e2e8f0"}`,
                    borderRadius: 8,
                    cursor: "pointer",
                    fontSize: 13,
                    color: "#374151",
                    textAlign: "left",
                  }}
                >
                  <span>{doc}</span>
                  {driver.docs?.[doc] ? (
                    <span style={{ fontSize: 11, color: "#10b981", fontWeight: 600 }}>Already received</span>
                  ) : (
                    <span style={{ fontSize: 11, color: "#94a3b8" }}>Mark as received</span>
                  )}
                </button>
              ))}
            </div>
            <button
              onClick={() => confirmPendingFile(null)}
              style={{
                width: "100%",
                padding: "10px",
                background: "#f8fafc",
                border: "1px solid #e2e8f0",
                borderRadius: 8,
                fontSize: 13,
                color: "#64748b",
                cursor: "pointer",
              }}
            >
              Skip - upload without linking to checklist
            </button>
          </div>
        </div>
      )}

      {deleteModal && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(15,23,42,.55)",
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
              background: "#fff",
              borderRadius: 16,
              width: "100%",
              maxWidth: 420,
              padding: 22,
              boxShadow: "0 20px 60px rgba(0,0,0,.2)",
              border: "1px solid #fee2e2",
            }}
          >
            <div style={{ fontSize: 16, fontWeight: 700, color: "#7f1d1d", marginBottom: 6 }}>
              Delete file?
            </div>
            <div style={{ fontSize: 13, color: "#64748b", lineHeight: 1.5, marginBottom: 16 }}>
              File{" "}
              <span
                style={{
                  fontWeight: 600,
                  color: "#334155",
                  overflowWrap: "anywhere",
                  wordBreak: "break-word",
                }}
              >
                {deleteModal.name}
              </span>{" "}
              will be permanently removed from the driver profile and cloud storage.
            </div>

            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
              <button
                onClick={() => setDeleteModal(null)}
                style={{
                  padding: "9px 14px",
                  background: "#f8fafc",
                  border: "1px solid #e2e8f0",
                  borderRadius: 8,
                  fontSize: 13,
                  color: "#475569",
                  cursor: "pointer",
                }}
              >
                Cancel
              </button>
              <button
                onClick={confirmDeleteFile}
                style={{
                  padding: "9px 14px",
                  background: "#dc2626",
                  border: "1px solid #dc2626",
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
