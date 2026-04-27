import { useState } from "react";
import { TRUCK_STATUSES, TRUCK_DOC_LIST, TRUCK_COMPANIES, OIL_CHANGE_INTERVAL } from "../constants/truckData";
import { useDriversStore } from "../store/useDriversStore";

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

export default function TruckDrawer({ truck, onClose, onUpd, onDelete, onAssignDriver, onUnassignDriver }) {
  const { drivers } = useDriversStore();
  const [tab, setTab] = useState("info");
  const [editing, setEditing] = useState(false);
  const [editData, setEditData] = useState({ ...truck });
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [showAssignPicker, setShowAssignPicker] = useState(false);
  const [assignSearch, setAssignSearch] = useState("");

  const assignedDriver = truck.assignedDriverId
    ? drivers.find((d) => d.id === truck.assignedDriverId)
    : null;

  const oilLeft = OIL_CHANGE_INTERVAL - (Number(truck.currentOdometer) - Number(truck.lastOilChange));
  const oilColor = oilLeft < 0 ? "#dc2626" : oilLeft < 1500 ? "#f59e0b" : "#16a34a";

  function setED(key, val) { setEditData((p) => ({ ...p, [key]: val })); }

  function saveEdit() {
    onUpd(truck.id, editData);
    setEditing(false);
  }

  function toggleDoc(docName) {
    onUpd(truck.id, { docs: { ...truck.docs, [docName]: !truck.docs?.[docName] } });
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
                {truck.year || "—"} · {truck.truckCompany || "—"} · VIN ...{truck.vinNumber ? truck.vinNumber.slice(-6) : "—"}
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
            {[["info", "Info"], ["documents", `Docs (${docsCount}/${TRUCK_DOC_LIST.length})`]].map(([id, label]) => (
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
                        ["maxWeight", "Max Weight (lbs)"],
                        ["vinNumber", "VIN"],
                        ["eldId", "ELD ID"],
                        ["homeLocation", "Home Location"],
                        ["fuelCard", "Fuel Card"],
                      ].map(([key, label]) => (
                        <div key={key}>
                          <FL t={label} />
                          <input value={editData[key] || ""} onChange={(e) => setED(key, e.target.value)} style={inputStyle} />
                        </div>
                      ))}
                      <div>
                        <FL t="Company" />
                        <select value={editData.truckCompany || "SKP BROKERAGE"} onChange={(e) => setED("truckCompany", e.target.value)} style={{ ...inputStyle, cursor: "pointer" }}>
                          {TRUCK_COMPANIES.map((c) => <option key={c}>{c}</option>)}
                        </select>
                      </div>
                    </div>
                    <div style={{ display: "flex", gap: 8 }}>
                      <button onClick={saveEdit} style={{ flex: 1, padding: "9px", background: "var(--color-primary)", color: "#fff", border: "none", borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: "pointer" }}>Save</button>
                      <button onClick={() => setEditing(false)} style={{ padding: "9px 16px", background: "var(--bg-hover)", color: "var(--text-muted)", border: "none", borderRadius: 8, fontSize: 13, cursor: "pointer" }}>Cancel</button>
                    </div>
                  </div>
                ) : (
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                    <InfoBox label="Year" value={truck.year} />
                    <InfoBox label="Max Weight" value={truck.maxWeight ? `${truck.maxWeight} lbs` : null} />
                    <InfoBox label="Company" value={truck.truckCompany} />
                    <InfoBox label="ELD ID" value={truck.eldId} />
                    <InfoBox label="VIN" value={truck.vinNumber} />
                    <InfoBox label="Home Location" value={truck.homeLocation} />
                    <InfoBox label="Fuel Card" value={truck.fuelCard} />
                  </div>
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
                  background: oilLeft < 0 ? "#fef2f2" : oilLeft < 1500 ? "#fffbeb" : "#f0fdf4",
                  border: `1px solid ${oilColor}44`, borderRadius: 9, padding: "10px 14px",
                }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 5 }}>
                    <span style={{ fontSize: 12, color: "var(--text-muted)", fontWeight: 600 }}>Left till oil change</span>
                    <span style={{ fontSize: 14, fontWeight: 800, color: oilColor }}>
                      {oilLeft >= 0 ? `${oilLeft.toLocaleString()} mi` : `${Math.abs(oilLeft).toLocaleString()} mi OVERDUE`}
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
              <div style={{ borderTop: "1px solid var(--border)", paddingTop: 14 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: "var(--text-muted)", letterSpacing: ".06em", textTransform: "uppercase" }}>Insurance</div>
                  {(!truck.insuranceStatus || truck.insuranceStatus === "none") && (
                    <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 7px", borderRadius: 20, background: "#fef2f2", color: "#dc2626", border: "1px solid #fecaca" }}>
                      ⚠ Not on Insurance
                    </span>
                  )}
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                  <div>
                    <FL t="Status" />
                    <select
                      value={truck.insuranceStatus || "none"}
                      onChange={(e) => onUpd(truck.id, { insuranceStatus: e.target.value })}
                      style={{ width: "100%", padding: "8px 10px", fontSize: 13, background: truck.insuranceStatus === "active" ? "#f0fdf4" : "#fef2f2", border: `1px solid ${truck.insuranceStatus === "active" ? "#86efac" : "#fecaca"}`, borderRadius: 7, color: truck.insuranceStatus === "active" ? "#15803d" : "#dc2626", outline: "none", cursor: "pointer", fontWeight: 600, boxSizing: "border-box" }}
                    >
                      <option value="none">Not on Insurance</option>
                      <option value="active">On Insurance ✓</option>
                    </select>
                  </div>
                  <div>
                    <FL t="Insurance Company" />
                    <input
                      value={truck.insuranceCompany || ""}
                      onChange={(e) => onUpd(truck.id, { insuranceCompany: e.target.value })}
                      placeholder="e.g. Progressive"
                      style={{ width: "100%", padding: "8px 10px", fontSize: 13, background: "var(--bg-raised)", border: "1px solid var(--border)", borderRadius: 7, color: "var(--text-primary)", outline: "none", boxSizing: "border-box" }}
                    />
                  </div>
                </div>
              </div>

              {/* Assigned Driver */}
              <div style={{ borderTop: "1px solid var(--border)", paddingTop: 14 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: "var(--text-muted)", letterSpacing: ".06em", textTransform: "uppercase", marginBottom: 10 }}>Assigned Driver</div>

                {assignedDriver ? (
                  <div style={{ background: "var(--color-primary-light)", border: "1px solid var(--color-primary-border)", borderRadius: 10, padding: "12px 14px" }}>
                    <div style={{ fontSize: 14, fontWeight: 700, color: "var(--color-primary-dark)" }}>{assignedDriver.name}</div>
                    <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 2 }}>{assignedDriver.phone}</div>
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
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              <div>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
                  <span style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>Required Documents</span>
                  <span style={{ fontSize: 12, color: docsCount === TRUCK_DOC_LIST.length ? "var(--color-success)" : "var(--text-faint)", fontWeight: 500 }}>
                    {docsCount} / {TRUCK_DOC_LIST.length} received
                  </span>
                </div>
                <div style={{ background: "var(--bg-hover)", borderRadius: 4, height: 5, marginBottom: 12 }}>
                  <div style={{
                    height: "100%",
                    width: `${(docsCount / TRUCK_DOC_LIST.length) * 100}%`,
                    background: docsCount === TRUCK_DOC_LIST.length ? "var(--color-success)" : "#3b82f6",
                    borderRadius: 4, transition: "width .3s",
                  }} />
                </div>
                <div style={{ background: "var(--bg-surface)", border: "1px solid var(--border)", borderRadius: 10, overflow: "hidden" }}>
                  {TRUCK_DOC_LIST.map((docName, idx) => {
                    const checked = !!truck.docs?.[docName];
                    return (
                      <label
                        key={docName}
                        style={{
                          display: "flex", alignItems: "center", gap: 12, padding: "10px 14px",
                          borderBottom: idx < TRUCK_DOC_LIST.length - 1 ? "1px solid var(--bg-raised)" : "none",
                          cursor: "pointer",
                          background: checked ? "var(--color-success-bg)" : "var(--bg-surface)",
                          transition: "background .12s",
                        }}
                      >
                        <div style={{
                          width: 18, height: 18, borderRadius: 5,
                          border: `2px solid ${checked ? "var(--color-success)" : "var(--text-disabled)"}`,
                          background: checked ? "var(--color-success)" : "transparent",
                          display: "flex", alignItems: "center", justifyContent: "center",
                          flexShrink: 0, transition: "all .15s",
                        }}>
                          {checked && <span style={{ color: "#fff", fontSize: 10, fontWeight: 700 }}>v</span>}
                        </div>
                        <input type="checkbox" checked={checked} onChange={() => toggleDoc(docName)} style={{ display: "none" }} />
                        <span style={{ fontSize: 13, color: checked ? "var(--color-success-text)" : "var(--text-secondary)", flex: 1 }}>
                          {docName}
                        </span>
                        {checked && <span style={{ fontSize: 10, color: "var(--color-success)", fontWeight: 600 }}>Received</span>}
                      </label>
                    );
                  })}
                </div>
              </div>

              {/* Files list */}
              <div style={{ borderTop: "1px solid var(--border)", paddingTop: 14 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: "var(--text-muted)", letterSpacing: ".06em", textTransform: "uppercase", marginBottom: 10 }}>
                  Uploaded Files ({(truck.files || []).length})
                </div>
                {(truck.files || []).length === 0 ? (
                  <div style={{ textAlign: "center", padding: "20px 0", fontSize: 13, color: "var(--text-disabled)" }}>
                    No files uploaded yet
                  </div>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
                    {(truck.files || []).map((file, idx) => (
                      <div key={idx} style={{ background: "var(--bg-raised)", border: "1px solid var(--border)", borderRadius: 9, padding: "10px 14px", display: "flex", alignItems: "center", gap: 10 }}>
                        <div style={{ width: 32, height: 32, background: "var(--color-primary-light)", borderRadius: 7, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, flexShrink: 0, color: "var(--color-primary-dark)" }}>
                          {file.type === "image" ? "IMG" : "FILE"}
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text-secondary)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{file.name}</div>
                          <div style={{ fontSize: 10, color: "var(--text-faint)", marginTop: 2 }}>{file.date}</div>
                        </div>
                        {(file.url || file.data) && (
                          <a href={file.url || file.data} target="_blank" rel="noopener noreferrer" style={{ fontSize: 11, color: "var(--color-primary)", fontWeight: 600, textDecoration: "none" }}>View</a>
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
    </div>
  );
}
