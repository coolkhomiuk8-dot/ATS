import { useState, useRef } from "react";
import { TRUCK_STATUSES, TRUCK_DOC_LIST, DRIVER_DOC_LIST, OIL_CHANGE_INTERVAL, OIL_WARN_SOON, OIL_WARN_URGENT } from "../constants/truckData";
import { useDriversStore } from "../store/useDriversStore";
import { useTrucksStore } from "../store/useTrucksStore";
import { expiryStatus, tenureLabel, fmtDate } from "../utils/date";

function FL({ t }) {
  return <div style={{ fontSize: 11, color: "var(--text-faint)", marginBottom: 3, fontWeight: 600 }}>{t}</div>;
}

function InfoBox({ label, value }) {
  return (
    <div style={{ background: "var(--bg-raised)", border: "1px solid var(--border)", borderRadius: 8, padding: "9px 11px" }}>
      <div style={{ fontSize: 10, color: "var(--text-faint)", marginBottom: 3, fontWeight: 500 }}>{label}</div>
      <div style={{ fontSize: 13, color: "var(--text-primary)" }}>{value || "—"}</div>
    </div>
  );
}

function StatusBadge({ status }) {
  const s = TRUCK_STATUSES.find((x) => x.id === status) || TRUCK_STATUSES[3];
  return (
    <span style={{
      fontSize: 12, fontWeight: 700, padding: "3px 10px", borderRadius: 20,
      background: s.bg, color: s.color, border: `1px solid ${s.color}44`,
    }}>
      {s.label}
    </span>
  );
}

function fmtSize(bytes) {
  if (!bytes) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function DocSection({ title, subtitle, docList, category, truck, files, isUploading, fileRef, onToggleDoc, onUpload, onDeleteFile, onPreview, allFiles }) {
  const received = docList.filter((d) => truck.docs?.[d]).length;
  const isImage = (f) => f.type === "image" || /\.(jpg|jpeg|png|gif|webp|heic)$/i.test(f.name || "");

  return (
    <div style={{ background: "var(--bg-raised)", border: "1px solid var(--border)", borderRadius: 12, overflow: "hidden" }}>
      {/* Header */}
      <div style={{ padding: "12px 14px", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", justifyContent: "space-between", background: "var(--bg-surface)" }}>
        <div>
          <div style={{ fontSize: 13, fontWeight: 700, color: "var(--text-primary)" }}>{title}</div>
          <div style={{ fontSize: 10, color: "var(--text-faint)", marginTop: 2 }}>{subtitle}</div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 11, color: received === docList.length ? "#15803d" : "var(--text-faint)", fontWeight: 600 }}>
            {received}/{docList.length} docs
          </span>
          <button
            onClick={() => fileRef.current?.click()}
            disabled={isUploading}
            style={{ padding: "5px 12px", background: "var(--color-primary)", color: "#fff", border: "none", borderRadius: 7, fontSize: 12, fontWeight: 600, cursor: isUploading ? "wait" : "pointer", opacity: isUploading ? .6 : 1 }}
          >
            {isUploading ? "Uploading..." : "+ Upload"}
          </button>
          <input ref={fileRef} type="file" multiple accept="image/*,.pdf" style={{ display: "none" }} onChange={(e) => onUpload(e.target.files)} />
        </div>
      </div>

      {/* Checklist */}
      <div style={{ borderBottom: "1px solid var(--border)" }}>
        {docList.map((docName, idx) => {
          const checked = !!truck.docs?.[docName];
          const linkedFiles = files.filter((f) => f.linkedDoc === docName);
          return (
            <div key={docName} style={{ borderBottom: idx < docList.length - 1 ? "1px solid var(--bg-hover)" : "none" }}>
              <label style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 14px", cursor: "pointer", background: checked ? "#f0fdf4" : "transparent" }}>
                <div style={{ width: 17, height: 17, borderRadius: 4, border: `2px solid ${checked ? "#16a34a" : "var(--text-disabled)"}`, background: checked ? "#16a34a" : "transparent", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  {checked && <span style={{ color: "#fff", fontSize: 9, fontWeight: 700 }}>✓</span>}
                </div>
                <input type="checkbox" checked={checked} onChange={() => onToggleDoc(docName)} style={{ display: "none" }} />
                <span style={{ fontSize: 13, color: checked ? "#15803d" : "var(--text-secondary)", flex: 1 }}>{docName}</span>
                {linkedFiles.length > 0 && (
                  <div style={{ display: "flex", gap: 4 }}>
                    {linkedFiles.map((f, i) => {
                      const img = isImage(f) && (f.driveFileId ? `https://drive.google.com/thumbnail?id=${f.driveFileId}&sz=w80` : (f.url || f.data));
                      return img ? (
                        <img key={i} src={img} alt={f.name} onClick={(e) => { e.preventDefault(); e.stopPropagation(); onPreview(f); }} style={{ width: 28, height: 28, borderRadius: 4, objectFit: "cover", border: "1px solid #86efac", cursor: "zoom-in" }} />
                      ) : (
                        <a key={i} href={f.url || f.data} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()} style={{ fontSize: 9, padding: "2px 6px", background: "#eff6ff", color: "#2563eb", border: "1px solid #bfdbfe", borderRadius: 4, fontWeight: 600, textDecoration: "none" }}>FILE</a>
                      );
                    })}
                  </div>
                )}
              </label>
            </div>
          );
        })}
      </div>

      {/* Uploaded files for this category */}
      {files.length > 0 && (
        <div style={{ padding: "10px 14px", display: "flex", flexDirection: "column", gap: 6 }}>
          {files.map((file) => {
            const globalIdx = allFiles.indexOf(file);
            const img = isImage(file) && (file.driveFileId ? `https://drive.google.com/thumbnail?id=${file.driveFileId}&sz=w80` : (file.url || file.data));
            return (
              <div key={globalIdx} style={{ display: "flex", alignItems: "center", gap: 10, padding: "7px 10px", background: "var(--bg-surface)", border: "1px solid var(--border)", borderRadius: 8 }}>
                {img ? (
                  <img src={img} alt={file.name} onClick={() => onPreview(file)} style={{ width: 36, height: 36, borderRadius: 5, objectFit: "cover", cursor: "zoom-in", flexShrink: 0 }} />
                ) : (
                  <div style={{ width: 36, height: 36, background: "var(--color-primary-light)", borderRadius: 5, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 9, fontWeight: 700, color: "var(--color-primary-dark)", flexShrink: 0 }}>FILE</div>
                )}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{file.name}</div>
                  <div style={{ fontSize: 10, color: "var(--text-faint)", marginTop: 1 }}>{fmtSize(file.size)} · {file.date}</div>
                </div>
                <div style={{ display: "flex", gap: 6, flexShrink: 0, alignItems: "center" }}>
                  {img && <button onClick={() => onPreview(file)} style={{ fontSize: 11, color: "var(--color-primary)", background: "none", border: "none", cursor: "pointer", fontWeight: 600 }}>View</button>}
                  {(file.url || file.data) && !img && <a href={file.url || file.data} target="_blank" rel="noopener noreferrer" style={{ fontSize: 11, color: "var(--color-primary)", textDecoration: "none", fontWeight: 600 }}>Open</a>}
                  <button onClick={() => onDeleteFile(globalIdx)} style={{ fontSize: 11, color: "var(--color-danger, #dc2626)", background: "none", border: "none", cursor: "pointer" }}>✕</button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {files.length === 0 && (
        <div style={{ padding: "14px", textAlign: "center", fontSize: 12, color: "var(--text-disabled)" }}>
          No files uploaded yet — click + Upload
        </div>
      )}
    </div>
  );
}

export default function TruckDrawer({ truck, onClose, onUpd, onDelete, onAssignDriver, onUnassignDriver }) {
  const { drivers, upd: updateDriver } = useDriversStore();
  const { addTruckFile, deleteTruckFile } = useTrucksStore();
  const [tab, setTab] = useState("info");
  const [editing, setEditing] = useState(false);
  const [editData, setEditData] = useState({ ...truck });
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [showAssignPicker, setShowAssignPicker] = useState(false);
  const [assignSearch, setAssignSearch] = useState("");
  const [isUploading, setIsUploading] = useState(false);
  const [uploadCategory, setUploadCategory] = useState(null); // "truck" | "driver"
  const [lightbox, setLightbox] = useState(null); // { url, name }
  // Insurance inputs — must live at top level to keep hook count stable across tab switches
  const [alInput, setAlInput] = useState("");
  const [cgInput, setCgInput] = useState("");
  const [drvInsInput, setDrvInsInput] = useState("");
  const truckFileRef = useRef(null);
  const driverFileRef = useRef(null);

  const assignedDriver = truck.assignedDriverId
    ? drivers.find((d) => d.id === truck.assignedDriverId)
    : null;

  const oilLeft = OIL_CHANGE_INTERVAL - (Number(truck.currentOdometer) - Number(truck.lastOilChange));
  const oilColor = oilLeft < 0 ? "#dc2626" : oilLeft < OIL_WARN_URGENT ? "#f97316" : oilLeft < OIL_WARN_SOON ? "#f59e0b" : "#16a34a";

  function setED(key, val) { setEditData((p) => ({ ...p, [key]: val })); }

  function saveEdit() {
    onUpd(truck.id, editData);
    setEditing(false);
  }

  function toggleDoc(docName) {
    onUpd(truck.id, { docs: { ...truck.docs, [docName]: !truck.docs?.[docName] } });
  }

  async function handleUpload(rawFiles, category) {
    if (!rawFiles?.length || isUploading) return;
    setIsUploading(true);
    setUploadCategory(category);
    try {
      for (const rawFile of Array.from(rawFiles)) {
        const fileObj = {
          name: rawFile.name,
          type: rawFile.type.startsWith("image/") ? "image" : "file",
          mime: rawFile.type,
          size: rawFile.size,
          rawFile,
          category,
          date: new Date().toLocaleString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }),
          linkedDoc: null,
        };
        await addTruckFile(truck.id, fileObj);
      }
    } finally {
      setIsUploading(false);
      setUploadCategory(null);
      if (truckFileRef.current) truckFileRef.current.value = "";
      if (driverFileRef.current) driverFileRef.current.value = "";
    }
  }

  const hiredDrivers = drivers.filter((d) => d.stage === "hired");
  const filteredAssignDrivers = hiredDrivers.filter((d) => {
    if (!assignSearch.trim()) return true;
    const q = assignSearch.trim().toLowerCase();
    return (
      String(d.name || "").toLowerCase().includes(q) ||
      String(d.phone || "").includes(q)
    );
  });

  const inputStyle = {
    width: "100%", padding: "8px 10px", fontSize: 13,
    background: "var(--bg-raised)", border: "1px solid var(--border)",
    borderRadius: 7, color: "var(--text-primary)", outline: "none", boxSizing: "border-box",
  };

  const docsCount = Object.values(truck.docs || {}).filter(Boolean).length;
  const totalDocList = TRUCK_DOC_LIST.length + DRIVER_DOC_LIST.length;

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 300, display: "flex" }} onClick={onClose}>
      <div style={{ flex: 1 }} />
      <div
        className="s-in"
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 500,
          background: "var(--bg-surface)",
          borderLeft: "1px solid var(--border)",
          display: "flex",
          flexDirection: "column",
          height: "100%",
          boxShadow: "var(--shadow-drawer, -8px 0 32px rgba(0,0,0,.12))",
        }}
      >
        {/* Header */}
        <div style={{ padding: "18px 22px 14px", borderBottom: "1px solid var(--border)", flexShrink: 0 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 }}>
            <div>
              <div style={{ fontSize: 22, fontWeight: 800, color: "var(--text-primary)", letterSpacing: "-1px" }}>
                Unit {truck.unitNumber || "—"}
              </div>
              <div style={{ fontSize: 12, color: "var(--text-faint)", marginTop: 2 }}>
                {truck.year || "—"} · VIN ...{truck.vinNumber ? truck.vinNumber.slice(-6) : "—"}
              </div>
            </div>
            <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
              <StatusBadge status={truck.status} />
              <button
                onClick={() => setConfirmDelete(true)}
                style={{ background: "var(--color-danger-bg)", border: "1px solid var(--color-danger-border)", borderRadius: 8, width: 32, height: 32, cursor: "pointer", color: "var(--color-danger)", fontSize: 14, display: "flex", alignItems: "center", justifyContent: "center" }}
              >🗑</button>
              <button
                onClick={onClose}
                style={{ background: "var(--bg-raised)", border: "1px solid var(--border)", borderRadius: 8, width: 32, height: 32, cursor: "pointer", color: "var(--text-muted)", fontSize: 15, display: "flex", alignItems: "center", justifyContent: "center" }}
              >x</button>
            </div>
          </div>

          {/* Confirm delete */}
          {confirmDelete && (
            <div style={{ position: "fixed", inset: 0, background: "var(--overlay, rgba(0,0,0,.4))", zIndex: 3000, display: "flex", alignItems: "center", justifyContent: "center" }}>
              <div style={{ background: "var(--bg-surface)", borderRadius: 14, padding: 28, width: 340, boxShadow: "0 20px 60px rgba(0,0,0,.2)" }}>
                <div style={{ fontSize: 16, fontWeight: 700, color: "var(--text-primary)", marginBottom: 8 }}>Delete truck?</div>
                <div style={{ fontSize: 13, color: "var(--text-muted)", marginBottom: 20 }}>
                  Permanently delete Unit {truck.unitNumber}? This cannot be undone.
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  <button onClick={() => setConfirmDelete(false)} style={{ flex: 1, padding: "9px", background: "var(--bg-hover)", color: "var(--text-muted)", border: "none", borderRadius: 8, fontSize: 13, cursor: "pointer" }}>Cancel</button>
                  <button onClick={() => { onDelete(truck.id); }} style={{ flex: 1, padding: "9px", background: "var(--color-danger)", color: "#fff", border: "none", borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: "pointer" }}>Delete</button>
                </div>
              </div>
            </div>
          )}

          {/* Tabs */}
          <div style={{ display: "flex", gap: 0, marginTop: 8 }}>
            {[["info", "Info"], ["documents", `Docs (${docsCount}/${totalDocList})`]].map(([id, label]) => (
              <button
                key={id}
                onClick={() => setTab(id)}
                style={{
                  background: "none", border: "none", padding: "8px 12px 7px",
                  fontSize: 13, color: tab === id ? "var(--color-primary)" : "var(--text-muted)",
                  cursor: "pointer", borderBottom: tab === id ? "2px solid var(--color-primary)" : "2px solid transparent",
                  fontWeight: tab === id ? 700 : 400, transition: "all .15s",
                }}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: "auto", padding: "16px 22px" }}>

          {/* ── INFO TAB ── */}
          {tab === "info" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>

              {/* Basic Info */}
              <div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: "var(--text-muted)", letterSpacing: ".06em", textTransform: "uppercase" }}>Basic Info</div>
                  {!editing && (
                    <button onClick={() => { setEditData({ ...truck }); setEditing(true); }} style={{ fontSize: 12, color: "var(--color-primary)", background: "none", border: "none", cursor: "pointer", fontWeight: 600, padding: "2px 6px" }}>
                      Edit
                    </button>
                  )}
                </div>

                {editing ? (
                  <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                      {[
                        ["unitNumber", "Unit #"],
                        ["year", "Year"],
                        ["vinNumber", "VIN"],
                        ["homeLocation", "Home Location"],
                        ["fuelCard", "Fuel Card"],
                      ].map(([key, label]) => (
                        <div key={key}>
                          <FL t={label} />
                          <input value={editData[key] || ""} onChange={(e) => setED(key, e.target.value)} style={inputStyle} />
                        </div>
                      ))}
                      <div>
                        <FL t="Plates Expiry" />
                        <input type="date" value={editData.platesExpiry || ""} onChange={(e) => setED("platesExpiry", e.target.value)} style={inputStyle} />
                      </div>
                    </div>
                    <div style={{ display: "flex", gap: 8 }}>
                      <button onClick={saveEdit} style={{ flex: 1, padding: "9px", background: "var(--color-primary)", color: "#fff", border: "none", borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: "pointer" }}>Save</button>
                      <button onClick={() => setEditing(false)} style={{ padding: "9px 16px", background: "var(--bg-hover)", color: "var(--text-muted)", border: "none", borderRadius: 8, fontSize: 13, cursor: "pointer" }}>Cancel</button>
                    </div>
                  </div>
                ) : (
                  <>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                      <InfoBox label="Year" value={truck.year} />
                      <InfoBox label="VIN" value={truck.vinNumber} />
                      <InfoBox label="Home Location" value={truck.homeLocation} />
                      <InfoBox label="Fuel Card" value={truck.fuelCard} />
                    </div>
                    {/* Plates expiry */}
                    {(() => {
                      const exp = expiryStatus(truck.platesExpiry);
                      return (
                        <div style={{ background: exp ? exp.bg : "var(--bg-raised)", border: `1px solid ${exp ? exp.border : "var(--border)"}`, borderRadius: 8, padding: "9px 12px", display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 2 }}>
                          <div>
                            <div style={{ fontSize: 10, color: "var(--text-faint)", fontWeight: 600, marginBottom: 2 }}>PLATES EXPIRY</div>
                            <div style={{ fontSize: 13, color: "var(--text-primary)", fontWeight: 600 }}>
                              {truck.platesExpiry ? fmtDate(truck.platesExpiry) : "Not set"}
                            </div>
                          </div>
                          {exp ? (
                            <span style={{ fontSize: 11, fontWeight: 700, padding: "3px 9px", borderRadius: 20, background: exp.color + "22", color: exp.color, border: `1px solid ${exp.border}` }}>
                              {exp.label}
                            </span>
                          ) : (
                            <span style={{ fontSize: 11, fontWeight: 600, color: "var(--text-disabled)" }}>Set expiry date ↑</span>
                          )}
                        </div>
                      );
                    })()}
                  </>
                )}
              </div>

              {/* Odometer Section */}
              <div style={{ borderTop: "1px solid var(--border)", paddingTop: 14 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: "var(--text-muted)", letterSpacing: ".06em", textTransform: "uppercase", marginBottom: 10 }}>Odometer & Oil Change</div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 10 }}>
                  <div>
                    <FL t="Last Oil Change (mi)" />
                    <input
                      type="number"
                      value={truck.lastOilChange || ""}
                      onChange={(e) => onUpd(truck.id, { lastOilChange: Number(e.target.value) })}
                      style={inputStyle}
                      placeholder="0"
                    />
                  </div>
                  <div>
                    <FL t="Current Odometer (mi)" />
                    <input
                      type="number"
                      value={truck.currentOdometer || ""}
                      onChange={(e) => onUpd(truck.id, { currentOdometer: Number(e.target.value) })}
                      style={inputStyle}
                      placeholder="0"
                    />
                  </div>
                </div>
                <div style={{
                  background: oilLeft < 0 ? "#fef2f2" : oilLeft < OIL_WARN_URGENT ? "#fff7ed" : oilLeft < OIL_WARN_SOON ? "#fffbeb" : "#f0fdf4",
                  border: `1px solid ${oilColor}44`, borderRadius: 9, padding: "10px 14px",
                }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 5 }}>
                    <span style={{ fontSize: 12, color: "var(--text-muted)", fontWeight: 600 }}>Left till oil change</span>
                    <span style={{ fontSize: 14, fontWeight: 800, color: oilColor }}>
                      {oilLeft < 0
                        ? `${Math.abs(oilLeft).toLocaleString()} mi OVERDUE`
                        : oilLeft < OIL_WARN_URGENT
                          ? `⚠ ${oilLeft.toLocaleString()} mi — Change soon!`
                          : oilLeft < OIL_WARN_SOON
                            ? `${oilLeft.toLocaleString()} mi — Coming up`
                            : `${oilLeft.toLocaleString()} mi`}
                    </span>
                  </div>
                  <div style={{ height: 6, borderRadius: 99, background: "var(--bg-hover)", overflow: "hidden" }}>
                    <div style={{
                      height: "100%",
                      width: `${Math.max(0, Math.min(100, (oilLeft / OIL_CHANGE_INTERVAL) * 100))}%`,
                      background: oilColor, borderRadius: 99,
                    }} />
                  </div>
                  <div style={{ fontSize: 10, color: "var(--text-faint)", marginTop: 5 }}>
                    Target interval: {OIL_CHANGE_INTERVAL.toLocaleString()} miles
                    {truck.lastOilChange ? ` · Last change at ${Number(truck.lastOilChange).toLocaleString()} mi` : ""}
                  </div>
                </div>
              </div>

              {/* Status & Note */}
              <div style={{ borderTop: "1px solid var(--border)", paddingTop: 14 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: "var(--text-muted)", letterSpacing: ".06em", textTransform: "uppercase", marginBottom: 10 }}>Status</div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 10 }}>
                  <div>
                    <FL t="Status" />
                    <select
                      value={truck.status}
                      onChange={(e) => onUpd(truck.id, { status: e.target.value })}
                      style={{ ...inputStyle, cursor: "pointer" }}
                    >
                      {TRUCK_STATUSES.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
                    </select>
                  </div>
                </div>
                <div>
                  <FL t="Maintenance / Status Note" />
                  <input
                    value={truck.statusNote || ""}
                    onChange={(e) => onUpd(truck.id, { statusNote: e.target.value })}
                    style={inputStyle}
                    placeholder="e.g. На ремонті дилер IL (Addison)"
                  />
                </div>
              </div>

              {/* Insurance */}
              {(() => {
                const alCompany    = truck.autoLiabilityCompany || "";
                const cgCompany    = truck.cargoInsuranceCompany || "";
                const drvCompanies = assignedDriver?.insuranceCompanies || [];
                const insRow = { background: "var(--bg-raised)", border: "1px solid var(--border)", borderRadius: 10, padding: "12px 14px", display: "flex", flexDirection: "column", gap: 8 };
                const lbl2   = { fontSize: 11, fontWeight: 700, color: "var(--text-faint)", textTransform: "uppercase", letterSpacing: ".05em" };

                function addDrvIns() {
                  if (!assignedDriver) return;
                  const v = drvInsInput.trim();
                  if (!v || drvCompanies.includes(v)) return;
                  updateDriver(assignedDriver.id, { insuranceCompanies: [...drvCompanies, v] });
                  setDrvInsInput("");
                }
                function removeDrvIns(c) {
                  if (!assignedDriver) return;
                  updateDriver(assignedDriver.id, { insuranceCompanies: drvCompanies.filter((x) => x !== c) });
                }

                return (
                  <div style={{ borderTop: "1px solid var(--border)", paddingTop: 14 }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: "var(--text-muted)", letterSpacing: ".06em", textTransform: "uppercase", marginBottom: 12 }}>Insurance</div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>

                      {/* Auto Liability */}
                      <div style={insRow}>
                        <div style={lbl2}>Auto Liability</div>
                        {alCompany ? (
                          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                            <span style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 12, fontWeight: 700, padding: "4px 10px", borderRadius: 6, background: "#f0fdf4", color: "#15803d", border: "1px solid #86efac" }}>
                              ✓ {alCompany}
                              <button onClick={() => onUpd(truck.id, { autoLiabilityCompany: "", autoLiabilityStatus: "none" })} style={{ background: "none", border: "none", cursor: "pointer", color: "#15803d", fontSize: 14, padding: 0, lineHeight: 1, opacity: .7 }}>×</button>
                            </span>
                          </div>
                        ) : (
                          <span style={{ fontSize: 11, fontWeight: 700, padding: "3px 8px", borderRadius: 5, background: "#fef2f2", color: "#dc2626", border: "1px solid #fecaca", alignSelf: "flex-start" }}>⚠ Not set</span>
                        )}
                        <div style={{ display: "flex", gap: 6 }}>
                          <input value={alInput} onChange={(e) => setAlInput(e.target.value)}
                            onKeyDown={(e) => { if (e.key === "Enter" && alInput.trim()) { onUpd(truck.id, { autoLiabilityCompany: alInput.trim(), autoLiabilityStatus: "active" }); setAlInput(""); } }}
                            placeholder={alCompany ? "Change company..." : "Enter company name..."}
                            style={{ flex: 1, padding: "7px 10px", fontSize: 13, background: "var(--bg-surface)", border: "1px solid var(--border)", borderRadius: 7, color: "var(--text-primary)", outline: "none" }} />
                          <button onClick={() => { if (alInput.trim()) { onUpd(truck.id, { autoLiabilityCompany: alInput.trim(), autoLiabilityStatus: "active" }); setAlInput(""); } }}
                            style={{ padding: "7px 12px", background: "var(--color-primary)", color: "#fff", border: "none", borderRadius: 7, fontSize: 13, fontWeight: 600, cursor: "pointer" }}>Set</button>
                        </div>
                      </div>

                      {/* Cargo Insurance */}
                      <div style={insRow}>
                        <div style={lbl2}>Cargo Insurance</div>
                        {cgCompany ? (
                          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                            <span style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 12, fontWeight: 700, padding: "4px 10px", borderRadius: 6, background: "#f0fdf4", color: "#15803d", border: "1px solid #86efac" }}>
                              ✓ {cgCompany}
                              <button onClick={() => onUpd(truck.id, { cargoInsuranceCompany: "", cargoInsuranceStatus: "none" })} style={{ background: "none", border: "none", cursor: "pointer", color: "#15803d", fontSize: 14, padding: 0, lineHeight: 1, opacity: .7 }}>×</button>
                            </span>
                          </div>
                        ) : (
                          <span style={{ fontSize: 11, fontWeight: 700, padding: "3px 8px", borderRadius: 5, background: "#fef2f2", color: "#dc2626", border: "1px solid #fecaca", alignSelf: "flex-start" }}>⚠ Not set</span>
                        )}
                        <div style={{ display: "flex", gap: 6 }}>
                          <input value={cgInput} onChange={(e) => setCgInput(e.target.value)}
                            onKeyDown={(e) => { if (e.key === "Enter" && cgInput.trim()) { onUpd(truck.id, { cargoInsuranceCompany: cgInput.trim(), cargoInsuranceStatus: "active" }); setCgInput(""); } }}
                            placeholder={cgCompany ? "Change company..." : "Enter company name..."}
                            style={{ flex: 1, padding: "7px 10px", fontSize: 13, background: "var(--bg-surface)", border: "1px solid var(--border)", borderRadius: 7, color: "var(--text-primary)", outline: "none" }} />
                          <button onClick={() => { if (cgInput.trim()) { onUpd(truck.id, { cargoInsuranceCompany: cgInput.trim(), cargoInsuranceStatus: "active" }); setCgInput(""); } }}
                            style={{ padding: "7px 12px", background: "var(--color-primary)", color: "#fff", border: "none", borderRadius: 7, fontSize: 13, fontWeight: 600, cursor: "pointer" }}>Set</button>
                        </div>
                      </div>

                      {/* Driver Insurance */}
                      <div style={insRow}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <div style={lbl2}>Driver Insurance</div>
                          {assignedDriver && <span style={{ fontSize: 10, color: "var(--text-faint)" }}>{assignedDriver.name}</span>}
                        </div>
                        {!assignedDriver ? (
                          <span style={{ fontSize: 12, color: "var(--text-disabled)" }}>No driver assigned</span>
                        ) : (
                          <>
                            {drvCompanies.length === 0 && <span style={{ fontSize: 11, fontWeight: 700, padding: "3px 8px", borderRadius: 5, background: "#fef2f2", color: "#dc2626", border: "1px solid #fecaca", alignSelf: "flex-start" }}>⚠ Not set</span>}
                            {drvCompanies.length > 0 && (
                              <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
                                {drvCompanies.map((c) => (
                                  <span key={c} style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 12, fontWeight: 700, padding: "4px 10px", borderRadius: 6, background: "#f0fdf4", color: "#15803d", border: "1px solid #86efac" }}>
                                    ✓ {c}
                                    <button onClick={() => removeDrvIns(c)} style={{ background: "none", border: "none", cursor: "pointer", color: "#15803d", fontSize: 14, padding: 0, lineHeight: 1, opacity: .7 }}>×</button>
                                  </span>
                                ))}
                              </div>
                            )}
                            <div style={{ display: "flex", gap: 6 }}>
                              <input value={drvInsInput} onChange={(e) => setDrvInsInput(e.target.value)}
                                onKeyDown={(e) => e.key === "Enter" && addDrvIns()}
                                placeholder="Add insurance company..."
                                style={{ flex: 1, padding: "7px 10px", fontSize: 13, background: "var(--bg-surface)", border: "1px solid var(--border)", borderRadius: 7, color: "var(--text-primary)", outline: "none" }} />
                              <button onClick={addDrvIns} style={{ padding: "7px 12px", background: "var(--color-primary)", color: "#fff", border: "none", borderRadius: 7, fontSize: 13, fontWeight: 600, cursor: "pointer" }}>+ Add</button>
                            </div>
                          </>
                        )}
                      </div>

                    </div>
                  </div>
                );
              })()}

              {/* Assigned Driver */}
              <div style={{ borderTop: "1px solid var(--border)", paddingTop: 14 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: "var(--text-muted)", letterSpacing: ".06em", textTransform: "uppercase", marginBottom: 10 }}>Assigned Driver</div>

                {assignedDriver ? (
                  <div style={{ background: "var(--color-primary-light)", border: "1px solid var(--color-primary-border)", borderRadius: 10, padding: "12px 14px" }}>
                    <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
                      <div>
                        <div style={{ fontSize: 14, fontWeight: 700, color: "var(--color-primary-dark)" }}>{assignedDriver.name}</div>
                        <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 2 }}>{assignedDriver.phone}</div>
                      </div>
                      {/* Tenure badge */}
                      {(() => {
                        const t = tenureLabel(assignedDriver.hireDate);
                        return t ? (
                          <span style={{ fontSize: 11, fontWeight: 600, padding: "3px 8px", borderRadius: 20, background: "#eff6ff", color: "#1d4ed8", border: "1px solid #bfdbfe", flexShrink: 0 }}>
                            🗓 {t}
                          </span>
                        ) : null;
                      })()}
                    </div>
                    {/* DL expiry row */}
                    {(() => {
                      const exp = expiryStatus(assignedDriver.dlExpiry);
                      return (
                        <div style={{ marginTop: 8, display: "flex", alignItems: "center", gap: 8 }}>
                          <span style={{ fontSize: 11, color: "var(--text-faint)", fontWeight: 600 }}>DL expires:</span>
                          {assignedDriver.dlExpiry ? (
                            <span style={{ fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 20, background: exp ? exp.color + "22" : "var(--bg-hover)", color: exp ? exp.color : "var(--text-muted)", border: `1px solid ${exp ? exp.border : "var(--border)"}` }}>
                              {fmtDate(assignedDriver.dlExpiry)} · {exp?.label || ""}
                            </span>
                          ) : (
                            <span style={{ fontSize: 11, color: "var(--text-disabled)" }}>Not set</span>
                          )}
                        </div>
                      );
                    })()}
                    <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
                      <button
                        onClick={() => setShowAssignPicker(true)}
                        style={{ padding: "7px 14px", background: "var(--color-primary)", color: "#fff", border: "none", borderRadius: 7, fontSize: 12, fontWeight: 600, cursor: "pointer" }}
                      >
                        Change Driver
                      </button>
                      <button
                        onClick={() => onUnassignDriver(truck.id)}
                        style={{ padding: "7px 14px", background: "var(--bg-hover)", color: "var(--text-muted)", border: "1px solid var(--border)", borderRadius: 7, fontSize: 12, cursor: "pointer" }}
                      >
                        Unassign
                      </button>
                    </div>
                  </div>
                ) : (
                  <div style={{ background: "var(--bg-raised)", border: "1px solid var(--border)", borderRadius: 10, padding: "12px 14px" }}>
                    <div style={{ fontSize: 13, color: "var(--text-faint)", marginBottom: 10 }}>No driver assigned</div>
                    <button
                      onClick={() => setShowAssignPicker(true)}
                      style={{ padding: "8px 16px", background: "var(--color-primary)", color: "#fff", border: "none", borderRadius: 7, fontSize: 13, fontWeight: 600, cursor: "pointer" }}
                    >
                      Assign Driver
                    </button>
                  </div>
                )}

                {/* Assign picker dropdown */}
                {showAssignPicker && (
                  <div style={{ marginTop: 10, background: "var(--bg-surface)", border: "1px solid var(--border)", borderRadius: 10, overflow: "hidden", boxShadow: "0 8px 24px rgba(0,0,0,.12)" }}>
                    <div style={{ padding: "10px 12px", borderBottom: "1px solid var(--border)" }}>
                      <input
                        autoFocus
                        value={assignSearch}
                        onChange={(e) => setAssignSearch(e.target.value)}
                        placeholder="Search hired drivers..."
                        style={{ width: "100%", padding: "7px 10px", fontSize: 13, background: "var(--bg-raised)", border: "1px solid var(--border)", borderRadius: 7, outline: "none", color: "var(--text-primary)", boxSizing: "border-box" }}
                      />
                    </div>
                    <div style={{ maxHeight: 220, overflowY: "auto" }}>
                      {filteredAssignDrivers.length === 0 ? (
                        <div style={{ padding: "14px", fontSize: 13, color: "var(--text-faint)", textAlign: "center" }}>No hired drivers found</div>
                      ) : filteredAssignDrivers.map((d) => (
                        <button
                          key={d.id}
                          onClick={() => { onAssignDriver(truck.id, d.id); setShowAssignPicker(false); setAssignSearch(""); }}
                          style={{
                            width: "100%", padding: "10px 14px", border: "none", borderBottom: "1px solid var(--border)",
                            background: "transparent", cursor: "pointer", textAlign: "left",
                            display: "flex", flexDirection: "column", gap: 2,
                          }}
                          onMouseEnter={(e) => e.currentTarget.style.background = "var(--bg-hover)"}
                          onMouseLeave={(e) => e.currentTarget.style.background = "transparent"}
                        >
                          <span style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>{d.name}</span>
                          <span style={{ fontSize: 11, color: "var(--text-faint)" }}>{d.phone}</span>
                        </button>
                      ))}
                    </div>
                    <button
                      onClick={() => { setShowAssignPicker(false); setAssignSearch(""); }}
                      style={{ width: "100%", padding: "9px", background: "var(--bg-raised)", border: "none", borderTop: "1px solid var(--border)", cursor: "pointer", fontSize: 12, color: "var(--text-muted)" }}
                    >
                      Cancel
                    </button>
                  </div>
                )}
              </div>

              {/* Notes */}
              <div style={{ borderTop: "1px solid var(--border)", paddingTop: 14 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: "var(--text-muted)", letterSpacing: ".06em", textTransform: "uppercase", marginBottom: 10 }}>Notes</div>
                <textarea
                  value={truck.notes || ""}
                  onChange={(e) => onUpd(truck.id, { notes: e.target.value })}
                  rows={3}
                  placeholder="Any notes about this truck..."
                  style={{ ...inputStyle, resize: "vertical", lineHeight: 1.6 }}
                />
              </div>
            </div>
          )}

          {/* ── DOCUMENTS TAB ── */}
          {tab === "documents" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>

              {/* ── TRUCK DOCUMENTS ── */}
              <DocSection
                title="Truck Documents"
                subtitle="Plates · Registration · VIN Picture"
                docList={TRUCK_DOC_LIST}
                category="truck"
                truck={truck}
                files={(truck.files || []).filter((f) => f.category === "truck" || !f.category)}
                isUploading={isUploading && uploadCategory === "truck"}
                fileRef={truckFileRef}
                onToggleDoc={toggleDoc}
                onUpload={(rawFiles) => handleUpload(rawFiles, "truck")}
                onDeleteFile={(globalIdx) => deleteTruckFile(truck.id, globalIdx)}
                onPreview={(file) => setLightbox({ url: file.driveFileId ? `https://drive.google.com/thumbnail?id=${file.driveFileId}&sz=w1200` : (file.url || file.data), name: file.name })}
                allFiles={truck.files || []}
              />

              {/* ── DRIVER DOCUMENTS ── */}
              <DocSection
                title="Driver Documents"
                subtitle="Driver License · MVR · Criminal Record"
                docList={DRIVER_DOC_LIST}
                category="driver"
                truck={truck}
                files={(truck.files || []).filter((f) => f.category === "driver")}
                isUploading={isUploading && uploadCategory === "driver"}
                fileRef={driverFileRef}
                onToggleDoc={toggleDoc}
                onUpload={(rawFiles) => handleUpload(rawFiles, "driver")}
                onDeleteFile={(globalIdx) => deleteTruckFile(truck.id, globalIdx)}
                onPreview={(file) => setLightbox({ url: file.driveFileId ? `https://drive.google.com/thumbnail?id=${file.driveFileId}&sz=w1200` : (file.url || file.data), name: file.name })}
                allFiles={truck.files || []}
              />
            </div>
          )}

          {/* Lightbox */}
          {lightbox && (
            <div
              onClick={() => setLightbox(null)}
              style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.85)", zIndex: 9999, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}
            >
              <div onClick={(e) => e.stopPropagation()} style={{ position: "relative", maxWidth: "90vw", maxHeight: "90vh" }}>
                <img src={lightbox.url} alt={lightbox.name} style={{ maxWidth: "100%", maxHeight: "85vh", borderRadius: 10, boxShadow: "0 20px 60px rgba(0,0,0,.5)", display: "block" }} onError={(e) => { e.target.style.display = "none"; }} />
                <div style={{ textAlign: "center", color: "#fff", fontSize: 12, marginTop: 8, opacity: .7 }}>{lightbox.name}</div>
                <button onClick={() => setLightbox(null)} style={{ position: "absolute", top: -12, right: -12, background: "#fff", border: "none", borderRadius: "50%", width: 28, height: 28, cursor: "pointer", fontSize: 14, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center" }}>×</button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
