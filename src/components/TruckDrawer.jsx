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

/* ── Assign Confirm Modal ── */
function AssignConfirmModal({ driver, onClose, onConfirm }) {
  const hasRates = (driver.emptyMilesRate != null && driver.emptyMilesRate !== 0) &&
                   (driver.loadedMilesRate != null && driver.loadedMilesRate !== 0);

  const initContacts = Array.isArray(driver.emergencyContacts) && driver.emergencyContacts.length > 0
    ? driver.emergencyContacts.map((c) => ({ name: c.name || "", phone: c.phone || "" }))
    : [{ name: "", phone: "" }];

  const [form, setForm] = useState({
    dlExpiry:        driver.dlExpiry        || "",
    emptyMilesRate:  driver.emptyMilesRate  != null && driver.emptyMilesRate !== 0 ? String(driver.emptyMilesRate) : "",
    loadedMilesRate: driver.loadedMilesRate != null && driver.loadedMilesRate !== 0 ? String(driver.loadedMilesRate) : "",
    citizen:        driver.citizen        ?? null,
    militaryLoads:  driver.militaryLoads  ?? null,
  });
  const [contacts, setContacts] = useState(initContacts);
  const [errors, setErrors] = useState({});

  function setF(k, v) { setForm((p) => ({ ...p, [k]: v })); setErrors((p) => ({ ...p, [k]: false })); }
  function setC(idx, key, val) {
    setContacts((prev) => prev.map((c, i) => i === idx ? { ...c, [key]: val } : c));
    setErrors((p) => ({ ...p, [`c_${idx}_${key}`]: false }));
  }
  function addContact() { setContacts((prev) => [...prev, { name: "", phone: "" }]); }
  function removeContact(idx) { setContacts((prev) => prev.filter((_, i) => i !== idx)); }

  const inputStyle = {
    width: "100%", padding: "8px 10px", fontSize: 13,
    background: "var(--bg-raised)", border: "1px solid var(--border)",
    borderRadius: 7, color: "var(--text-primary)", outline: "none", boxSizing: "border-box",
  };
  const errStyle = { ...inputStyle, border: "1.5px solid #fca5a5" };
  const labelStyle = { fontSize: 10, fontWeight: 700, color: "var(--text-faint)", textTransform: "uppercase", letterSpacing: ".05em", marginBottom: 6 };

  function RadioGroup({ value, onChange, options }) {
    return (
      <div style={{ display: "flex", gap: 6 }}>
        {options.map((opt) => {
          const active = value === opt.val;
          return (
            <button
              key={opt.val}
              onClick={() => onChange(active ? null : opt.val)}
              style={{
                flex: 1, padding: "7px 0", border: `1.5px solid ${active ? opt.color : "var(--border)"}`,
                borderRadius: 7, cursor: "pointer", fontSize: 12, fontWeight: active ? 700 : 500,
                background: active ? opt.bg : "var(--bg-raised)", color: active ? opt.color : "var(--text-muted)",
                transition: "all .12s",
              }}
            >{opt.label}</button>
          );
        })}
      </div>
    );
  }

  function handleConfirm() {
    const e = {};
    if (!form.dlExpiry)                                       e.dlExpiry = true;
    if (!form.emptyMilesRate || Number(form.emptyMilesRate) <= 0)  e.emptyMilesRate = true;
    if (!form.loadedMilesRate || Number(form.loadedMilesRate) <= 0) e.loadedMilesRate = true;
    contacts.forEach((c, i) => {
      if (!c.name.trim())  e[`c_${i}_name`] = true;
      if (!c.phone.trim()) e[`c_${i}_phone`] = true;
    });
    if (Object.keys(e).length > 0) { setErrors(e); return; }
    onConfirm({ ...form, emergencyContacts: contacts });
  }

  return (
    <div
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.55)", zIndex: 5000, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}
    >
      <div onClick={(e) => e.stopPropagation()} style={{
        background: "var(--bg-surface)", borderRadius: 16, width: 440,
        padding: "24px 24px 20px", boxShadow: "0 24px 60px rgba(0,0,0,.3)",
        maxHeight: "90vh", overflowY: "auto",
      }}>
        {/* Header */}
        <div style={{ marginBottom: 18 }}>
          <div style={{ fontSize: 16, fontWeight: 800, color: "var(--text-primary)" }}>Assign Driver</div>
          <div style={{ fontSize: 12, color: "var(--text-faint)", marginTop: 3 }}>
            Confirm details for <strong>{driver.name}</strong> before assigning
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>

          {/* DL Expiry */}
          <div>
            <div style={labelStyle}>
              Driver License Expiry{!driver.dlExpiry && <span style={{ color: "#dc2626" }}> *</span>}
            </div>
            <input
              type="date"
              value={form.dlExpiry}
              onChange={(e) => setF("dlExpiry", e.target.value)}
              style={errors.dlExpiry ? errStyle : inputStyle}
            />
          </div>

          {/* Rates */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <div>
              <div style={labelStyle}>
                Empty miles rate (¢){!hasRates && <span style={{ color: "#dc2626" }}> *</span>}
              </div>
              <input
                type="number" min="0" step="1"
                value={form.emptyMilesRate}
                onChange={(e) => setF("emptyMilesRate", e.target.value)}
                placeholder="e.g. 55"
                style={errors.emptyMilesRate ? errStyle : inputStyle}
              />
            </div>
            <div>
              <div style={labelStyle}>
                Loaded miles rate (¢){!hasRates && <span style={{ color: "#dc2626" }}> *</span>}
              </div>
              <input
                type="number" min="0" step="1"
                value={form.loadedMilesRate}
                onChange={(e) => setF("loadedMilesRate", e.target.value)}
                placeholder="e.g. 75"
                style={errors.loadedMilesRate ? errStyle : inputStyle}
              />
            </div>
          </div>

          {/* Citizen */}
          <div>
            <div style={labelStyle}>Citizen</div>
            <RadioGroup
              value={form.citizen === true ? "yes" : form.citizen === false ? "no" : null}
              onChange={(v) => setF("citizen", v === "yes" ? true : v === "no" ? false : null)}
              options={[
                { val: "yes", label: "Yes", color: "#16a34a", bg: "#f0fdf4" },
                { val: "no",  label: "No",  color: "#dc2626", bg: "#fef2f2" },
              ]}
            />
          </div>

          {/* Military loads */}
          <div>
            <div style={labelStyle}>OK to do military loads</div>
            <RadioGroup
              value={form.militaryLoads}
              onChange={(v) => setF("militaryLoads", v)}
              options={[
                { val: "yes",      label: "Yes",      color: "#16a34a", bg: "#f0fdf4" },
                { val: "no",       label: "No",       color: "#dc2626", bg: "#fef2f2" },
                { val: "not_sure", label: "Not sure", color: "#f59e0b", bg: "#fffbeb" },
              ]}
            />
          </div>

          {/* Emergency Contacts */}
          <div style={{ borderTop: "1px solid var(--border)", paddingTop: 12 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text-faint)", textTransform: "uppercase", letterSpacing: ".05em" }}>
                  Emergency Contacts
                  {!(Array.isArray(driver.emergencyContacts) && driver.emergencyContacts.length > 0) && (
                    <span style={{ color: "#dc2626" }}> *</span>
                  )}
                </div>
                {Array.isArray(driver.emergencyContacts) && driver.emergencyContacts.length > 0 && (
                  <div style={{ fontSize: 10, color: "#16a34a", marginTop: 2 }}>Auto-filled from driver profile</div>
                )}
              </div>
              <button
                onClick={addContact}
                style={{ padding: "4px 10px", background: "var(--bg-raised)", border: "1px solid var(--border)", borderRadius: 6, fontSize: 12, fontWeight: 600, color: "var(--color-primary)", cursor: "pointer" }}
              >+ Add</button>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {contacts.map((c, i) => (
                <div key={i} style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
                  <div style={{ flex: 1, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                    <div>
                      {i === 0 && <div style={{ ...labelStyle, marginBottom: 4 }}>Name</div>}
                      <input
                        value={c.name}
                        onChange={(e) => setC(i, "name", e.target.value)}
                        placeholder="John Miller"
                        style={errors[`c_${i}_name`] ? errStyle : inputStyle}
                      />
                    </div>
                    <div>
                      {i === 0 && <div style={{ ...labelStyle, marginBottom: 4 }}>Phone</div>}
                      <input
                        value={c.phone}
                        onChange={(e) => setC(i, "phone", e.target.value)}
                        placeholder="(999) 999-9999"
                        style={errors[`c_${i}_phone`] ? errStyle : inputStyle}
                      />
                    </div>
                  </div>
                  {contacts.length > 1 && (
                    <button
                      onClick={() => removeContact(i)}
                      style={{
                        marginTop: i === 0 ? 20 : 0,
                        width: 30, height: 36, flexShrink: 0,
                        background: "#fef2f2", border: "1px solid #fecaca",
                        borderRadius: 6, cursor: "pointer", color: "#dc2626", fontSize: 14,
                        display: "flex", alignItems: "center", justifyContent: "center",
                      }}
                    >×</button>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Validation error */}
          {Object.keys(errors).length > 0 && (
            <div style={{ background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 7, padding: "7px 10px", fontSize: 12, color: "#dc2626" }}>
              ⚠ Please fill in all required fields
            </div>
          )}

        </div>

        {/* Actions */}
        <div style={{ display: "flex", gap: 8, marginTop: 20 }}>
          <button
            onClick={handleConfirm}
            style={{ flex: 1, padding: "11px", background: "var(--color-primary)", color: "#fff", border: "none", borderRadius: 9, fontSize: 14, fontWeight: 700, cursor: "pointer" }}
          >
            Assign Driver
          </button>
          <button
            onClick={onClose}
            style={{ padding: "11px 16px", background: "var(--bg-raised)", color: "var(--text-muted)", border: "1px solid var(--border)", borderRadius: 9, fontSize: 13, cursor: "pointer" }}
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

/* ── Upload Modal ── */
function UploadModal({ category, docList, onClose, onSave }) {
  const fileRef = useRef(null);
  const [selectedDoc, setSelectedDoc] = useState(docList[0] || "");
  const [selectedFile, setSelectedFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState(null);

  async function handleSave() {
    if (!selectedDoc || !selectedFile || uploading) return;
    setUploading(true);
    setError(null);
    try {
      await onSave(selectedFile, selectedDoc, category);
      onClose();
    } catch (err) {
      setError(String(err?.message || "Upload failed"));
      setUploading(false);
    }
  }

  return (
    <div
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.55)", zIndex: 4000, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}
    >
      <div style={{ background: "var(--bg-surface)", borderRadius: 16, width: 400, padding: "24px 24px 20px", boxShadow: "0 24px 60px rgba(0,0,0,.3)" }}>
        {/* Title */}
        <div style={{ fontSize: 16, fontWeight: 800, color: "var(--text-primary)", marginBottom: 4 }}>Upload Document</div>
        <div style={{ fontSize: 12, color: "var(--text-faint)", marginBottom: 18 }}>
          Select the document type, then choose your file.
        </div>

        {/* Doc type list */}
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: "var(--text-faint)", textTransform: "uppercase", letterSpacing: ".06em", marginBottom: 8 }}>Document Type</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
            {docList.map((doc) => {
              const active = selectedDoc === doc;
              return (
                <label
                  key={doc}
                  style={{
                    display: "flex", alignItems: "center", gap: 10,
                    padding: "9px 12px", borderRadius: 8, cursor: "pointer",
                    border: `1.5px solid ${active ? "var(--color-primary)" : "var(--border)"}`,
                    background: active ? "var(--color-primary-light, #eff6ff)" : "var(--bg-raised)",
                    transition: "all .1s",
                  }}
                >
                  <div style={{
                    width: 16, height: 16, borderRadius: "50%", flexShrink: 0,
                    border: `2px solid ${active ? "var(--color-primary)" : "var(--text-disabled)"}`,
                    background: active ? "var(--color-primary)" : "transparent",
                    display: "flex", alignItems: "center", justifyContent: "center",
                  }}>
                    {active && <div style={{ width: 5, height: 5, borderRadius: "50%", background: "#fff" }} />}
                  </div>
                  <input type="radio" name="docType" value={doc} checked={active} onChange={() => setSelectedDoc(doc)} style={{ display: "none" }} />
                  <span style={{ fontSize: 13, fontWeight: active ? 700 : 400, color: active ? "var(--color-primary-dark, #1e40af)" : "var(--text-secondary)" }}>
                    {doc}
                  </span>
                </label>
              );
            })}
          </div>
        </div>

        {/* File picker */}
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: "var(--text-faint)", textTransform: "uppercase", letterSpacing: ".06em", marginBottom: 8 }}>File</div>
          <div
            onClick={() => fileRef.current?.click()}
            style={{
              padding: "12px 14px", border: `2px dashed ${selectedFile ? "var(--color-primary)" : "var(--border)"}`,
              borderRadius: 9, cursor: "pointer", textAlign: "center",
              color: selectedFile ? "var(--text-secondary)" : "var(--text-disabled)",
              fontSize: 13, background: selectedFile ? "var(--color-primary-light, #eff6ff)" : "var(--bg-raised)",
              transition: "all .15s",
            }}
          >
            {selectedFile ? (
              <span>📄 <strong>{selectedFile.name}</strong> <span style={{ color: "var(--text-faint)", fontWeight: 400 }}>({fmtSize(selectedFile.size)})</span></span>
            ) : (
              <span>Click to choose a file… <span style={{ fontSize: 11 }}>(image or PDF)</span></span>
            )}
          </div>
          <input
            ref={fileRef}
            type="file"
            accept="image/*,.pdf"
            style={{ display: "none" }}
            onChange={(e) => { setSelectedFile(e.target.files?.[0] || null); e.target.value = ""; }}
          />
        </div>

        {/* Error */}
        {error && (
          <div style={{ marginBottom: 12, fontSize: 12, color: "#dc2626", background: "#fef2f2", border: "1px solid #fecaca", padding: "7px 10px", borderRadius: 7 }}>
            ⚠ {error}
          </div>
        )}

        {/* Actions */}
        <div style={{ display: "flex", gap: 8 }}>
          <button
            onClick={handleSave}
            disabled={!selectedDoc || !selectedFile || uploading}
            style={{
              flex: 1, padding: "11px",
              background: (!selectedDoc || !selectedFile || uploading) ? "var(--text-disabled)" : "var(--color-primary)",
              color: "#fff", border: "none", borderRadius: 9, fontSize: 14, fontWeight: 700,
              cursor: (!selectedDoc || !selectedFile || uploading) ? "default" : "pointer",
              transition: "background .15s",
            }}
          >
            {uploading ? "Uploading…" : "Upload & Save"}
          </button>
          <button
            onClick={onClose}
            disabled={uploading}
            style={{ padding: "11px 18px", background: "var(--bg-raised)", color: "var(--text-muted)", border: "1px solid var(--border)", borderRadius: 9, fontSize: 13, cursor: uploading ? "default" : "pointer" }}
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

/* ── Oil Change Modal ── */
function OilChangeModal({ truck, onClose, onConfirm }) {
  const today = new Date().toISOString().split("T")[0];
  const [odometer, setOdometer] = useState(String(truck.currentOdometer || ""));
  const [date, setDate] = useState(today);
  const [file, setFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState(null);
  const fileRef = useRef(null);

  const inputSt = {
    width: "100%", padding: "9px 11px", fontSize: 13,
    background: "var(--bg-raised)", border: "1px solid var(--border)",
    borderRadius: 7, color: "var(--text-primary)", outline: "none", boxSizing: "border-box",
  };
  const labelSt = {
    fontSize: 11, fontWeight: 700, color: "var(--text-faint)",
    textTransform: "uppercase", letterSpacing: ".05em", marginBottom: 5, display: "block",
  };

  async function handleConfirm() {
    if (!odometer || Number(odometer) <= 0) { setError("Enter a valid mileage."); return; }
    if (!date) { setError("Enter the date."); return; }
    if (!file) { setError("Please add a proof photo or receipt."); return; }
    setUploading(true);
    setError(null);
    try {
      await onConfirm({ odometer: Number(odometer), date, file });
    } catch (err) {
      setError(String(err?.message || "Failed to record oil change."));
      setUploading(false);
    }
  }

  return (
    <div
      onClick={(e) => { e.stopPropagation(); if (e.target === e.currentTarget && !uploading) onClose(); }}
      style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.55)", zIndex: 4500, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}
    >
      <div onClick={(e) => e.stopPropagation()} style={{ background: "var(--bg-surface)", borderRadius: 16, width: 400, padding: "24px 24px 20px", boxShadow: "0 24px 60px rgba(0,0,0,.3)" }}>
        <div style={{ fontSize: 17, fontWeight: 800, color: "var(--text-primary)", marginBottom: 3 }}>🔧 Record Oil Change</div>
        <div style={{ fontSize: 12, color: "var(--text-faint)", marginBottom: 20 }}>Unit {truck.unitNumber}</div>

        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div>
            <div style={labelSt}>Odometer at change (mi) *</div>
            <input
              autoFocus
              type="number"
              value={odometer}
              onChange={(e) => setOdometer(e.target.value)}
              placeholder="e.g. 255000"
              style={inputSt}
            />
          </div>
          <div>
            <div style={labelSt}>Date *</div>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} style={inputSt} />
          </div>
          <div>
            <div style={labelSt}>
              Proof photo or receipt *
              {file && (
                <button
                  type="button"
                  onClick={() => setFile(null)}
                  style={{ marginLeft: 8, background: "none", border: "none", cursor: "pointer", color: "#dc2626", fontSize: 12, fontWeight: 700, padding: 0 }}
                >
                  ✕ Remove
                </button>
              )}
            </div>
            <div
              onClick={() => !uploading && fileRef.current?.click()}
              style={{
                padding: "14px 14px", borderRadius: 9, cursor: uploading ? "default" : "pointer",
                textAlign: "center", fontSize: 13,
                border: `2px dashed ${file ? "#16a34a" : "var(--border)"}`,
                background: file ? "#f0fdf4" : "var(--bg-raised)",
                color: file ? "#15803d" : "var(--text-disabled)",
                transition: "all .15s",
              }}
            >
              {file ? (
                <div>
                  <div style={{ fontSize: 22, marginBottom: 4 }}>
                    {file.type.startsWith("image/") ? "🖼" : "📄"}
                  </div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: "#15803d" }}>{file.name}</div>
                  <div style={{ fontSize: 11, color: "#16a34a", marginTop: 2 }}>{fmtSize(file.size)} · ready to upload</div>
                </div>
              ) : (
                <div>
                  <div style={{ fontSize: 22, marginBottom: 4 }}>📎</div>
                  <div style={{ fontSize: 13, fontWeight: 600 }}>Click to add photo or receipt</div>
                  <div style={{ fontSize: 11, marginTop: 2 }}>Image or PDF</div>
                </div>
              )}
            </div>
            <input ref={fileRef} type="file" accept="image/*,.pdf" style={{ display: "none" }}
              onChange={(e) => { setFile(e.target.files?.[0] || null); e.target.value = ""; }} />
          </div>

          {error && (
            <div style={{ fontSize: 12, color: "#dc2626", background: "#fef2f2", border: "1px solid #fecaca", padding: "7px 10px", borderRadius: 7 }}>
              ⚠ {error}
            </div>
          )}
        </div>

        <div style={{ display: "flex", gap: 8, marginTop: 20 }}>
          <button
            onClick={handleConfirm}
            disabled={uploading}
            style={{
              flex: 1, padding: "11px",
              background: uploading ? "var(--text-disabled)" : "#16a34a",
              color: "#fff", border: "none", borderRadius: 9, fontSize: 14, fontWeight: 700,
              cursor: uploading ? "default" : "pointer", transition: "background .15s",
            }}
          >
            {uploading ? "Uploading & saving…" : "Record Oil Change"}
          </button>
          <button
            onClick={onClose}
            disabled={uploading}
            style={{ padding: "11px 18px", background: "var(--bg-raised)", color: "var(--text-muted)", border: "1px solid var(--border)", borderRadius: 9, fontSize: 13, cursor: uploading ? "default" : "pointer" }}
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

/* ── Doc Section ── */
function DocSection({ title, subtitle, docList, truck, files, onOpenUpload, onDeleteFile, onPreview, allFiles, deletingSet, onUpdDoc }) {
  const [ssnInput, setSsnInput] = useState("");
  const [ssnEditing, setSsnEditing] = useState(false);

  const received = docList.filter((d) => !!truck.docs?.[d]).length;
  const isImage = (f) => f.type === "image" || /\.(jpg|jpeg|png|gif|webp|heic)$/i.test(f.name || "");

  // SSN stored as digit string in truck.docs.SSN (truthy → checkbox green)
  const ssnSaved = typeof truck.docs?.SSN === "string" && truck.docs.SSN.length > 0 ? truck.docs.SSN : null;

  function saveSsn() {
    const digits = ssnInput.replace(/\D/g, "");
    if (!digits) return;
    onUpdDoc?.({ SSN: digits });
    setSsnInput("");
    setSsnEditing(false);
  }

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
            onClick={onOpenUpload}
            style={{ padding: "5px 12px", background: "var(--color-primary)", color: "#fff", border: "none", borderRadius: 7, fontSize: 12, fontWeight: 600, cursor: "pointer" }}
          >
            + Upload
          </button>
        </div>
      </div>

      {/* Checklist — read-only, checked only when file is uploaded */}
      <div style={{ borderBottom: files.length > 0 ? "1px solid var(--border)" : "none" }}>
        {docList.map((docName, idx) => {
          const checked = !!truck.docs?.[docName];
          const linkedFiles = files.filter((f) => f.linkedDoc === docName);
          return (
            <div key={docName} style={{ borderBottom: idx < docList.length - 1 ? "1px solid var(--bg-hover)" : "none" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 14px", background: checked ? "#f0fdf4" : "transparent" }}>
                {/* Read-only checkbox */}
                <div style={{
                  width: 17, height: 17, borderRadius: 4, flexShrink: 0,
                  border: `2px solid ${checked ? "#16a34a" : "var(--text-disabled)"}`,
                  background: checked ? "#16a34a" : "transparent",
                  display: "flex", alignItems: "center", justifyContent: "center",
                }}>
                  {checked && <span style={{ color: "#fff", fontSize: 9, fontWeight: 700 }}>✓</span>}
                </div>
                <span style={{ fontSize: 13, color: checked ? "#15803d" : "var(--text-secondary)", flex: 1, fontWeight: checked ? 600 : 400 }}>
                  {docName}
                </span>
                {/* Thumbnails for linked files */}
                {linkedFiles.length > 0 && (
                  <div style={{ display: "flex", gap: 4 }}>
                    {linkedFiles.map((f, i) => {
                      const img = isImage(f) && (f.driveFileId ? `https://drive.google.com/thumbnail?id=${f.driveFileId}&sz=w80` : (f.url || f.data));
                      return img ? (
                        <img key={i} src={img} alt={f.name} onClick={() => onPreview(f)} style={{ width: 28, height: 28, borderRadius: 4, objectFit: "cover", border: "1px solid #86efac", cursor: "zoom-in" }} />
                      ) : (
                        <a key={i} href={f.url || f.data} target="_blank" rel="noopener noreferrer" style={{ fontSize: 9, padding: "2px 6px", background: "#eff6ff", color: "#2563eb", border: "1px solid #bfdbfe", borderRadius: 4, fontWeight: 600, textDecoration: "none" }}>FILE</a>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* SSN — inline number entry (OR upload via + Upload) */}
              {docName === "SSN" && (
                <div style={{ padding: "0 14px 10px 40px" }}>
                  {ssnSaved && !ssnEditing ? (
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span style={{ fontSize: 13, fontFamily: "monospace", fontWeight: 700, color: "#15803d", letterSpacing: "0.08em" }}>
                        ***-**-{ssnSaved.slice(-4)}
                      </span>
                      <button
                        onClick={() => { setSsnInput(ssnSaved); setSsnEditing(true); }}
                        style={{ fontSize: 11, color: "var(--color-primary)", background: "none", border: "none", cursor: "pointer", fontWeight: 600, padding: "1px 4px" }}
                      >Edit</button>
                    </div>
                  ) : (
                    <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                      <input
                        value={ssnInput}
                        onChange={(e) => setSsnInput(e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && saveSsn()}
                        placeholder="Enter SSN digits…"
                        style={{
                          flex: 1, padding: "5px 9px", fontSize: 12, fontFamily: "monospace",
                          background: "var(--bg-surface)", border: "1px solid var(--border)",
                          borderRadius: 6, color: "var(--text-primary)", outline: "none",
                        }}
                      />
                      <button onClick={saveSsn} style={{ padding: "5px 11px", background: "var(--color-primary)", color: "#fff", border: "none", borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: "pointer" }}>Save</button>
                      {ssnEditing && (
                        <button onClick={() => { setSsnEditing(false); setSsnInput(""); }} style={{ padding: "5px 8px", background: "var(--bg-hover)", border: "none", borderRadius: 6, fontSize: 13, cursor: "pointer", color: "var(--text-muted)" }}>×</button>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Uploaded files list */}
      {files.length > 0 && (
        <div style={{ padding: "10px 14px", display: "flex", flexDirection: "column", gap: 6 }}>
          {files.map((file) => {
            const globalIdx = allFiles.indexOf(file);
            const isDeleting = deletingSet?.has(globalIdx);
            const img = isImage(file) && (file.driveFileId ? `https://drive.google.com/thumbnail?id=${file.driveFileId}&sz=w80` : (file.url || file.data));
            return (
              <div key={globalIdx} style={{
                display: "flex", alignItems: "center", gap: 10, padding: "7px 10px",
                background: isDeleting ? "#eff6ff" : "var(--bg-surface)",
                border: `1px solid ${isDeleting ? "#bfdbfe" : "var(--border)"}`,
                borderRadius: 8, transition: "background .2s, border-color .2s",
              }}>
                {/* Thumbnail or file icon */}
                {isDeleting ? (
                  <div style={{ width: 36, height: 36, borderRadius: 5, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <div style={{ width: 20, height: 20, border: "2.5px solid #2563eb", borderTopColor: "transparent", borderRadius: "50%", animation: "spin .6s linear infinite" }} />
                  </div>
                ) : img ? (
                  <img src={img} alt={file.name} onClick={() => onPreview(file)} style={{ width: 36, height: 36, borderRadius: 5, objectFit: "cover", cursor: "zoom-in", flexShrink: 0 }} />
                ) : (
                  <div style={{ width: 36, height: 36, background: "var(--color-primary-light)", borderRadius: 5, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 9, fontWeight: 700, color: "var(--color-primary-dark)", flexShrink: 0 }}>FILE</div>
                )}

                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: isDeleting ? "#2563eb" : "var(--text-secondary)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{file.name}</div>
                  <div style={{ fontSize: 10, color: isDeleting ? "#93c5fd" : "var(--text-faint)", marginTop: 1 }}>
                    {isDeleting
                      ? "Deleting from Drive…"
                      : <>{file.linkedDoc && <span style={{ fontWeight: 700, color: "#15803d" }}>{file.linkedDoc} · </span>}{fmtSize(file.size)} · {file.date}</>
                    }
                  </div>
                </div>

                <div style={{ display: "flex", gap: 6, flexShrink: 0, alignItems: "center" }}>
                  {!isDeleting && img && <button onClick={() => onPreview(file)} style={{ fontSize: 11, color: "var(--color-primary)", background: "none", border: "none", cursor: "pointer", fontWeight: 600 }}>View</button>}
                  {!isDeleting && (file.url || file.data) && !img && <a href={file.url || file.data} target="_blank" rel="noopener noreferrer" style={{ fontSize: 11, color: "var(--color-primary)", textDecoration: "none", fontWeight: 600 }}>Open</a>}
                  <button
                    onClick={() => !isDeleting && onDeleteFile(globalIdx)}
                    disabled={isDeleting}
                    style={{ fontSize: 11, color: isDeleting ? "#93c5fd" : "var(--color-danger, #dc2626)", background: "none", border: "none", cursor: isDeleting ? "default" : "pointer", opacity: isDeleting ? .5 : 1 }}
                  >✕</button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {files.length === 0 && (
        <div style={{ padding: "16px", textAlign: "center", fontSize: 12, color: "var(--text-disabled)" }}>
          No files uploaded yet — click + Upload
        </div>
      )}
    </div>
  );
}

/* ══════════════════════════════════════════════
   TRUCK DRAWER
══════════════════════════════════════════════ */
export default function TruckDrawer({ truck, onClose, onUpd, onDelete, onAssignDriver, onUnassignDriver }) {
  const { drivers, upd: updateDriver } = useDriversStore();
  const { addTruckFile, deleteTruckFile, addOilChange } = useTrucksStore();

  const [tab, setTab] = useState("info");
  const [editing, setEditing] = useState(false);
  const [editError, setEditError] = useState(null);
  const [editData, setEditData] = useState({ ...truck });
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [showAssignPicker, setShowAssignPicker] = useState(false);
  const [assignSearch, setAssignSearch] = useState("");
  const [lightbox, setLightbox] = useState(null);

  // Upload modal state — null = closed, { category: "truck"|"driver" } = open
  const [uploadModal, setUploadModal] = useState(null);
  // Assign confirm modal — null = closed, { driverId } = waiting for confirmation
  const [assignConfirm, setAssignConfirm] = useState(null); // { driverId }
  // Set of globalIdx values currently being deleted (Drive in progress)
  const [deletingSet, setDeletingSet] = useState(new Set());
  // When user tries to set status → Active without a driver, open picker and set this flag
  // so that after successful assign the status is also flipped to "active"
  const [pendingActiveStatus, setPendingActiveStatus] = useState(false);
  const [showOilChangeModal, setShowOilChangeModal] = useState(false);

  // Insurance inputs — top-level to keep hook count stable across tab switches
  const [alInput, setAlInput] = useState("");
  const [cgInput, setCgInput] = useState("");
  const [drvInsInput, setDrvInsInput] = useState("");

  const assignedDriver = truck.assignedDriverId
    ? drivers.find((d) => d.id === truck.assignedDriverId)
    : null;

  const oilLeft = OIL_CHANGE_INTERVAL - (Number(truck.currentOdometer) - Number(truck.lastOilChange));
  const oilColor = oilLeft < 0 ? "#dc2626" : oilLeft < OIL_WARN_URGENT ? "#f97316" : oilLeft < OIL_WARN_SOON ? "#f59e0b" : "#16a34a";

  function setED(key, val) { setEditData((p) => ({ ...p, [key]: val })); setEditError(null); }

  async function saveEdit() {
    setEditError(null);
    try {
      await onUpd(truck.id, editData);
      setEditing(false);
    } catch (err) {
      setEditError(String(err?.message || "Failed to save."));
    }
  }

  /* Upload a single file with a known document type */
  async function handleSingleUpload(rawFile, docName, category) {
    const fileObj = {
      name: rawFile.name,
      type: rawFile.type.startsWith("image/") ? "image" : "file",
      mime: rawFile.type,
      size: rawFile.size,
      rawFile,
      category,
      linkedDoc: docName,
      date: new Date().toLocaleString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }),
    };
    await addTruckFile(truck.id, fileObj);
    // Auto-check the document
    onUpd(truck.id, { docs: { ...(truck.docs || {}), [docName]: true } });
  }

  /* Delete a file — uncheck doc immediately, show spinner while Drive deletes */
  async function handleDeleteFile(globalIdx) {
    const file = (truck.files || [])[globalIdx];

    // Immediately uncheck the doc → card badge goes gray right away
    if (file?.linkedDoc) {
      const remaining = (truck.files || []).filter((f, i) => i !== globalIdx && f.linkedDoc === file.linkedDoc);
      if (remaining.length === 0) {
        onUpd(truck.id, { docs: { ...(truck.docs || {}), [file.linkedDoc]: false } });
      }
    }

    // Mark as deleting → row shows blue spinner
    setDeletingSet((prev) => { const next = new Set(prev); next.add(globalIdx); return next; });
    try {
      await deleteTruckFile(truck.id, globalIdx);
    } finally {
      setDeletingSet((prev) => { const next = new Set(prev); next.delete(globalIdx); return next; });
    }
  }

  async function handleOilChangeConfirm({ odometer, date, file }) {
    // Rename file to "oil_change_YYYY-MM-DD.ext" so Drive folder stays tidy
    const ext = (file.name.split(".").pop() || "jpg").toLowerCase();
    const fileName = `oil_change_${date}.${ext}`;

    const fileObj = {
      name: fileName,
      type: file.type.startsWith("image/") ? "image" : "file",
      mime: file.type,
      size: file.size,
      rawFile: file,
      category: "truck",
      linkedDoc: "Oil Change",
      date: new Date().toLocaleString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }),
    };
    await addOilChange(truck.id, { odometer, date, fileObj });
    setShowOilChangeModal(false);
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
            {[["info", "Info"], ["documents", `Docs (${docsCount}/${totalDocList})`], ["history", "History"]].map(([id, label]) => (
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
                      <div style={{ gridColumn: "1 / -1" }}>
                        <FL t="Samsara Vehicle ID" />
                        <input
                          value={editData.samsaraId || ""}
                          onChange={(e) => setED("samsaraId", e.target.value.trim() || null)}
                          style={inputStyle}
                          placeholder="e.g. 281474978004685 (auto-filled on sync)"
                        />
                      </div>
                    </div>
                    {editError && (
                      <div style={{ fontSize: 12, color: "#dc2626", background: "#fef2f2", border: "1px solid #fecaca", padding: "7px 10px", borderRadius: 7 }}>
                        ⚠ {editError}
                      </div>
                    )}
                    <div style={{ display: "flex", gap: 8 }}>
                      <button onClick={saveEdit} style={{ flex: 1, padding: "9px", background: "var(--color-primary)", color: "#fff", border: "none", borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: "pointer" }}>Save</button>
                      <button onClick={() => { setEditing(false); setEditError(null); }} style={{ padding: "9px 16px", background: "var(--bg-hover)", color: "var(--text-muted)", border: "none", borderRadius: 8, fontSize: 13, cursor: "pointer" }}>Cancel</button>
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

              {/* Odometer & Oil Change */}
              <div style={{ borderTop: "1px solid var(--border)", paddingTop: 14 }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: "var(--text-muted)", letterSpacing: ".06em", textTransform: "uppercase" }}>Odometer & Oil Change</div>
                  <button
                    onClick={() => setShowOilChangeModal(true)}
                    style={{ padding: "5px 12px", background: "#16a34a", color: "#fff", border: "none", borderRadius: 7, fontSize: 12, fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", gap: 5 }}
                  >
                    🔧 Do Oil Change
                  </button>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 10 }}>
                  <div>
                    <FL t="Last Oil Change (mi)" />
                    <input type="number" value={truck.lastOilChange || ""} onChange={(e) => onUpd(truck.id, { lastOilChange: Number(e.target.value) })} style={inputStyle} placeholder="0" />
                  </div>
                  <div>
                    <FL t="Current Odometer (mi)" />
                    <input type="number" value={truck.currentOdometer || ""} onChange={(e) => onUpd(truck.id, { currentOdometer: Number(e.target.value) })} style={inputStyle} placeholder="0" />
                  </div>
                </div>
                <div style={{ background: oilLeft < 0 ? "#fef2f2" : oilLeft < OIL_WARN_URGENT ? "#fff7ed" : oilLeft < OIL_WARN_SOON ? "#fffbeb" : "#f0fdf4", border: `1px solid ${oilColor}44`, borderRadius: 9, padding: "10px 14px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 5 }}>
                    <span style={{ fontSize: 12, color: "var(--text-muted)", fontWeight: 600 }}>Left till oil change</span>
                    <span style={{ fontSize: 14, fontWeight: 800, color: oilColor }}>
                      {oilLeft < 0 ? `${Math.abs(oilLeft).toLocaleString()} mi OVERDUE` : oilLeft < OIL_WARN_URGENT ? `⚠ ${oilLeft.toLocaleString()} mi — Change soon!` : oilLeft < OIL_WARN_SOON ? `${oilLeft.toLocaleString()} mi — Coming up` : `${oilLeft.toLocaleString()} mi`}
                    </span>
                  </div>
                  <div style={{ height: 6, borderRadius: 99, background: "var(--bg-hover)", overflow: "hidden" }}>
                    <div style={{ height: "100%", width: `${Math.max(0, Math.min(100, (oilLeft / OIL_CHANGE_INTERVAL) * 100))}%`, background: oilColor, borderRadius: 99 }} />
                  </div>
                  <div style={{ fontSize: 10, color: "var(--text-faint)", marginTop: 5 }}>
                    Target interval: {OIL_CHANGE_INTERVAL.toLocaleString()} miles
                    {truck.lastOilChange ? ` · Last change at ${Number(truck.lastOilChange).toLocaleString()} mi` : ""}
                  </div>
                </div>

                {/* Oil Change Log */}
                {(truck.oilChangeLog || []).length > 0 && (() => {
                  const log = [...(truck.oilChangeLog || [])].reverse();
                  function fmtLogDate(d) {
                    if (!d) return "—";
                    const dt = new Date(d + "T00:00:00");
                    return isNaN(dt) ? d : dt.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
                  }
                  return (
                    <div style={{ marginTop: 12 }}>
                      <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: ".06em", marginBottom: 7 }}>
                        Oil Change Log
                      </div>
                      <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                        {log.map((entry, i) => {
                          const isImage = entry.fileType === "image" || /\.(jpg|jpeg|png|gif|webp|heic)$/i.test(entry.fileName || "");
                          const thumbUrl = entry.driveFileId
                            ? `https://drive.google.com/thumbnail?id=${entry.driveFileId}&sz=w80`
                            : (isImage ? (entry.fileUrl || entry.viewUrl) : null);
                          const openUrl = entry.viewUrl || entry.fileUrl;
                          const isCurrent = i === 0;
                          return (
                            <div key={i} style={{
                              display: "flex", alignItems: "center", gap: 10,
                              padding: "8px 12px", borderRadius: 9,
                              background: isCurrent ? "#f0fdf4" : "var(--bg-raised)",
                              border: `1px solid ${isCurrent ? "#86efac" : "var(--border)"}`,
                            }}>
                              {/* Proof thumbnail or icon */}
                              {thumbUrl ? (
                                <img
                                  src={thumbUrl}
                                  alt={entry.fileName}
                                  onClick={() => setLightbox({ url: entry.driveFileId ? `https://drive.google.com/thumbnail?id=${entry.driveFileId}&sz=w1200` : entry.fileUrl, name: entry.fileName })}
                                  style={{ width: 34, height: 34, borderRadius: 5, objectFit: "cover", cursor: "zoom-in", flexShrink: 0, border: "1px solid #86efac" }}
                                />
                              ) : entry.fileName ? (
                                <a href={openUrl} target="_blank" rel="noopener noreferrer" style={{ width: 34, height: 34, flexShrink: 0, borderRadius: 5, background: "#eff6ff", border: "1px solid #bfdbfe", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 9, fontWeight: 700, color: "#2563eb", textDecoration: "none" }}>DOC</a>
                              ) : (
                                <div style={{ width: 8, height: 8, borderRadius: "50%", flexShrink: 0, background: isCurrent ? "#16a34a" : "var(--text-disabled)", margin: "0 13px" }} />
                              )}
                              <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ fontSize: 13, fontWeight: 700, color: isCurrent ? "#15803d" : "var(--text-primary)" }}>
                                  {Number(entry.odometer).toLocaleString()} mi
                                  {isCurrent && <span style={{ marginLeft: 7, fontSize: 10, fontWeight: 700, color: "#16a34a", background: "#dcfce7", padding: "1px 6px", borderRadius: 10 }}>Latest</span>}
                                </div>
                                <div style={{ fontSize: 11, color: "var(--text-faint)", marginTop: 1 }}>
                                  {fmtLogDate(entry.date)}
                                  {entry.fileName && <span style={{ marginLeft: 5, color: "#2563eb", fontWeight: 600 }}>· {entry.fileName}</span>}
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })()}
              </div>

              {/* Samsara — Fault Codes */}
              {(() => {
                const faults = truck.faultCodes || [];
                const syncedAt = truck.lastSamsaraSync;
                if (!truck.samsaraId && faults.length === 0) return null;
                function fmtSync(iso) {
                  if (!iso) return "never";
                  const diff = Math.round((Date.now() - new Date(iso)) / 60000);
                  if (diff < 1)   return "just now";
                  if (diff < 60)  return `${diff}m ago`;
                  if (diff < 1440) return `${Math.floor(diff / 60)}h ago`;
                  return `${Math.floor(diff / 1440)}d ago`;
                }
                const lampColor = (lamp) => lamp === "red" ? "#dc2626" : lamp === "amber" ? "#f97316" : "#6366f1";
                const lampBg    = (lamp) => lamp === "red" ? "#fef2f2" : lamp === "amber" ? "#fff7ed" : "#eef2ff";
                return (
                  <div style={{ borderTop: "1px solid var(--border)", paddingTop: 14 }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
                      <div style={{ fontSize: 12, fontWeight: 700, color: "var(--text-muted)", letterSpacing: ".06em", textTransform: "uppercase" }}>
                        📡 Samsara
                      </div>
                      {syncedAt && (
                        <span style={{ fontSize: 10, color: "var(--text-faint)" }}>
                          synced {fmtSync(syncedAt)}
                        </span>
                      )}
                    </div>
                    {faults.length === 0 ? (
                      <div style={{ fontSize: 12, color: "#16a34a", fontWeight: 600 }}>✅ No active fault codes</div>
                    ) : (
                      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                        {faults.map((f, i) => (
                          <div key={i} style={{
                            display: "flex", alignItems: "center", gap: 10,
                            background: lampBg(f.lamp), border: `1px solid ${lampColor(f.lamp)}33`,
                            borderRadius: 8, padding: "8px 12px",
                          }}>
                            <span style={{ fontSize: 16 }}>
                              {f.lamp === "red" ? "🔴" : f.lamp === "amber" ? "🟡" : "🔵"}
                            </span>
                            <div style={{ flex: 1 }}>
                              <div style={{ fontSize: 13, fontWeight: 700, color: lampColor(f.lamp) }}>
                                SPN {f.j1939Spn} &nbsp;·&nbsp; FMI {f.j1939Fmi}
                                <span style={{ marginLeft: 8, fontSize: 10, fontWeight: 600, padding: "1px 6px", borderRadius: 8, background: lampColor(f.lamp) + "22", color: lampColor(f.lamp), textTransform: "uppercase" }}>
                                  {f.lamp || "info"}
                                </span>
                              </div>
                              {f.updatedAtTime && (
                                <div style={{ fontSize: 10, color: "var(--text-faint)", marginTop: 2 }}>
                                  {new Date(f.updatedAtTime).toLocaleString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                                </div>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })()}

              {/* Status & Note */}
              <div style={{ borderTop: "1px solid var(--border)", paddingTop: 14 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: "var(--text-muted)", letterSpacing: ".06em", textTransform: "uppercase", marginBottom: 10 }}>Status</div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 10 }}>
                  <div>
                    <FL t="Status" />
                    <select
                      value={truck.status}
                      onChange={(e) => {
                        const val = e.target.value;
                        if (val === "active" && !assignedDriver) {
                          // Prompt to assign a driver first, then activate
                          setPendingActiveStatus(true);
                          setShowAssignPicker(true);
                          return;
                        }
                        onUpd(truck.id, { status: val });
                      }}
                      style={{ ...inputStyle, cursor: "pointer" }}
                    >
                      {TRUCK_STATUSES.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.label}{s.id === "active" && !assignedDriver ? " — assign driver first" : ""}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
                {!assignedDriver && (
                  <div style={{ marginTop: -4, marginBottom: 8, fontSize: 11, color: "#92400e", background: "#fffbeb", border: "1px solid #fde68a", borderRadius: 7, padding: "6px 10px" }}>
                    ⚠ To set Active — assign a driver first
                  </div>
                )}
                <div>
                  <FL t="Maintenance / Status Note" />
                  <input value={truck.statusNote || ""} onChange={(e) => onUpd(truck.id, { statusNote: e.target.value })} style={inputStyle} placeholder="e.g. На ремонті дилер IL (Addison)" />
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
                            placeholder={alCompany ? "Change company…" : "Enter company name…"}
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
                            placeholder={cgCompany ? "Change company…" : "Enter company name…"}
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
                                placeholder="Add insurance company…"
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
                      {(() => {
                        const t = tenureLabel(assignedDriver.hireDate);
                        return t ? (
                          <span style={{ fontSize: 11, fontWeight: 600, padding: "3px 8px", borderRadius: 20, background: "#eff6ff", color: "#1d4ed8", border: "1px solid #bfdbfe", flexShrink: 0 }}>
                            🗓 {t}
                          </span>
                        ) : null;
                      })()}
                    </div>
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
                      <button onClick={() => setShowAssignPicker(true)} style={{ padding: "7px 14px", background: "var(--color-primary)", color: "#fff", border: "none", borderRadius: 7, fontSize: 12, fontWeight: 600, cursor: "pointer" }}>Change Driver</button>
                      <button onClick={() => onUnassignDriver(truck.id)} style={{ padding: "7px 14px", background: "var(--bg-hover)", color: "var(--text-muted)", border: "1px solid var(--border)", borderRadius: 7, fontSize: 12, cursor: "pointer" }}>Unassign</button>
                    </div>
                  </div>
                ) : (
                  <div style={{ background: "var(--bg-raised)", border: "1px solid var(--border)", borderRadius: 10, padding: "12px 14px" }}>
                    <div style={{ fontSize: 13, color: "var(--text-faint)", marginBottom: 10 }}>No driver assigned</div>
                    <button onClick={() => setShowAssignPicker(true)} style={{ padding: "8px 16px", background: "var(--color-primary)", color: "#fff", border: "none", borderRadius: 7, fontSize: 13, fontWeight: 600, cursor: "pointer" }}>Assign Driver</button>
                  </div>
                )}

                {showAssignPicker && (
                  <div style={{ marginTop: 10, background: "var(--bg-surface)", border: "1px solid var(--border)", borderRadius: 10, overflow: "hidden", boxShadow: "0 8px 24px rgba(0,0,0,.12)" }}>
                    {pendingActiveStatus && (
                      <div style={{ padding: "9px 12px", background: "#eff6ff", borderBottom: "1px solid #bfdbfe", fontSize: 12, color: "#1d4ed8", fontWeight: 600 }}>
                        Assign a driver to set this truck to Active
                      </div>
                    )}
                    <div style={{ padding: "10px 12px", borderBottom: "1px solid var(--border)" }}>
                      <input autoFocus value={assignSearch} onChange={(e) => setAssignSearch(e.target.value)} placeholder="Search hired drivers…" style={{ width: "100%", padding: "7px 10px", fontSize: 13, background: "var(--bg-raised)", border: "1px solid var(--border)", borderRadius: 7, outline: "none", color: "var(--text-primary)", boxSizing: "border-box" }} />
                    </div>
                    <div style={{ maxHeight: 220, overflowY: "auto" }}>
                      {filteredAssignDrivers.length === 0 ? (
                        <div style={{ padding: "14px", fontSize: 13, color: "var(--text-faint)", textAlign: "center" }}>No hired drivers found</div>
                      ) : filteredAssignDrivers.map((d) => (
                        <button key={d.id} onClick={() => { setAssignConfirm({ driverId: d.id }); setShowAssignPicker(false); setAssignSearch(""); }}
                          style={{ width: "100%", padding: "10px 14px", border: "none", borderBottom: "1px solid var(--border)", background: "transparent", cursor: "pointer", textAlign: "left", display: "flex", flexDirection: "column", gap: 2 }}
                          onMouseEnter={(e) => e.currentTarget.style.background = "var(--bg-hover)"}
                          onMouseLeave={(e) => e.currentTarget.style.background = "transparent"}
                        >
                          <span style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>{d.name}</span>
                          <span style={{ fontSize: 11, color: "var(--text-faint)" }}>{d.phone}</span>
                        </button>
                      ))}
                    </div>
                    <button onClick={() => { setShowAssignPicker(false); setAssignSearch(""); setPendingActiveStatus(false); }} style={{ width: "100%", padding: "9px", background: "var(--bg-raised)", border: "none", borderTop: "1px solid var(--border)", cursor: "pointer", fontSize: 12, color: "var(--text-muted)" }}>Cancel</button>
                  </div>
                )}
              </div>

              {/* Notes */}
              <div style={{ borderTop: "1px solid var(--border)", paddingTop: 14 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: "var(--text-muted)", letterSpacing: ".06em", textTransform: "uppercase", marginBottom: 10 }}>Notes</div>
                <textarea value={truck.notes || ""} onChange={(e) => onUpd(truck.id, { notes: e.target.value })} rows={3} placeholder="Any notes about this truck…" style={{ ...inputStyle, resize: "vertical", lineHeight: 1.6 }} />
              </div>
            </div>
          )}

          {/* ── DOCUMENTS TAB ── */}
          {tab === "documents" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
              <DocSection
                title="Truck Documents"
                subtitle="Plates · Registration · VIN Picture"
                docList={TRUCK_DOC_LIST}
                truck={truck}
                files={(truck.files || []).filter((f) => f.category === "truck" || !f.category)}
                onOpenUpload={() => setUploadModal({ category: "truck" })}
                onDeleteFile={handleDeleteFile}
                onPreview={(file) => setLightbox({ url: file.driveFileId ? `https://drive.google.com/thumbnail?id=${file.driveFileId}&sz=w1200` : (file.url || file.data), name: file.name })}
                allFiles={truck.files || []}
                deletingSet={deletingSet}
              />
              <DocSection
                title="Driver Documents"
                subtitle="License · MVR · Criminal · SSN · W9 · Agreement"
                docList={DRIVER_DOC_LIST}
                truck={truck}
                files={(truck.files || []).filter((f) => f.category === "driver")}
                onOpenUpload={() => setUploadModal({ category: "driver" })}
                onDeleteFile={handleDeleteFile}
                onPreview={(file) => setLightbox({ url: file.driveFileId ? `https://drive.google.com/thumbnail?id=${file.driveFileId}&sz=w1200` : (file.url || file.data), name: file.name })}
                allFiles={truck.files || []}
                deletingSet={deletingSet}
                onUpdDoc={(patch) => onUpd(truck.id, { docs: { ...(truck.docs || {}), ...patch } })}
              />
            </div>
          )}

          {/* ── HISTORY TAB ── */}
          {tab === "history" && (() => {
            const driverHistory = [...(truck.driverHistory || [])].reverse();
            const statusHistory = [...(truck.statusHistory || [])].reverse();

            function fmtH(d) {
              if (!d) return "Now";
              const dt = new Date(d + "T00:00:00");
              return isNaN(dt) ? d : dt.toLocaleDateString("en-US", { month: "2-digit", day: "2-digit", year: "numeric" });
            }
            function daysDiff(from, to) {
              const f = new Date((from || "") + "T00:00:00");
              const t = to ? new Date(to + "T00:00:00") : new Date();
              const d = Math.round((t - f) / 86400000);
              return d < 0 ? 0 : d;
            }

            const STATUS_COLORS = {
              active:      { color: "#16a34a", bg: "#f0fdf4", label: "Active" },
              maintenance: { color: "#dc2626", bg: "#fef2f2", label: "Maintenance" },
              available:   { color: "#2563eb", bg: "#eff6ff", label: "Available" },
              inactive:    { color: "#64748b", bg: "#f8fafc", label: "Inactive" },
            };

            return (
              <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>

                {/* Driver History */}
                <div>
                  <div style={{ fontSize: 12, fontWeight: 700, color: "var(--text-muted)", letterSpacing: ".06em", textTransform: "uppercase", marginBottom: 12 }}>
                    Driver History
                  </div>
                  {driverHistory.length === 0 ? (
                    <div style={{ fontSize: 13, color: "var(--text-disabled)" }}>No driver assignments recorded yet.</div>
                  ) : (
                    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                      {driverHistory.map((entry, i) => {
                        const days = daysDiff(entry.from, entry.to);
                        const isCurrent = !entry.to;
                        return (
                          <div key={i} style={{
                            display: "flex", alignItems: "center", gap: 12,
                            padding: "10px 14px", borderRadius: 10,
                            background: isCurrent ? "#f0fdf4" : "var(--bg-raised)",
                            border: `1px solid ${isCurrent ? "#86efac" : "var(--border)"}`,
                          }}>
                            <div style={{
                              width: 8, height: 8, borderRadius: "50%", flexShrink: 0,
                              background: isCurrent ? "#16a34a" : "var(--text-disabled)",
                            }} />
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ fontSize: 13, fontWeight: 700, color: isCurrent ? "#15803d" : "var(--text-primary)" }}>
                                {entry.driverName || entry.driverId}
                                {isCurrent && <span style={{ marginLeft: 7, fontSize: 10, fontWeight: 700, color: "#16a34a", background: "#dcfce7", padding: "1px 6px", borderRadius: 10 }}>Current</span>}
                              </div>
                              <div style={{ fontSize: 11, color: "var(--text-faint)", marginTop: 2 }}>
                                {fmtH(entry.from)} — {fmtH(entry.to)} · <strong>{days}d</strong>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* Status History */}
                <div>
                  <div style={{ fontSize: 12, fontWeight: 700, color: "var(--text-muted)", letterSpacing: ".06em", textTransform: "uppercase", marginBottom: 12 }}>
                    Status History
                  </div>
                  {statusHistory.length === 0 ? (
                    <div style={{ fontSize: 13, color: "var(--text-disabled)" }}>No status changes recorded yet.</div>
                  ) : (
                    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                      {statusHistory.map((entry, i) => {
                        const days = daysDiff(entry.from, entry.to);
                        const isCurrent = !entry.to;
                        const s = STATUS_COLORS[entry.status] || { color: "#64748b", bg: "#f8fafc", label: entry.status };
                        return (
                          <div key={i} style={{
                            display: "flex", alignItems: "center", gap: 12,
                            padding: "10px 14px", borderRadius: 10,
                            background: isCurrent ? s.bg : "var(--bg-raised)",
                            border: `1px solid ${isCurrent ? s.color + "55" : "var(--border)"}`,
                          }}>
                            <div style={{ width: 8, height: 8, borderRadius: "50%", flexShrink: 0, background: s.color }} />
                            <div style={{ flex: 1 }}>
                              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                <span style={{ fontSize: 12, fontWeight: 700, padding: "2px 8px", borderRadius: 20, background: s.bg, color: s.color, border: `1px solid ${s.color}44` }}>
                                  {s.label}
                                </span>
                                {isCurrent && <span style={{ fontSize: 10, fontWeight: 700, color: s.color }}>● Now</span>}
                              </div>
                              <div style={{ fontSize: 11, color: "var(--text-faint)", marginTop: 3 }}>
                                {fmtH(entry.from)} — {fmtH(entry.to)} · <strong>{days}d</strong>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

              </div>
            );
          })()}

          {/* Lightbox */}
          {lightbox && (
            <div onClick={() => setLightbox(null)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.85)", zIndex: 9999, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
              <div onClick={(e) => e.stopPropagation()} style={{ position: "relative", maxWidth: "90vw", maxHeight: "90vh" }}>
                <img src={lightbox.url} alt={lightbox.name} style={{ maxWidth: "100%", maxHeight: "85vh", borderRadius: 10, boxShadow: "0 20px 60px rgba(0,0,0,.5)", display: "block" }} onError={(e) => { e.target.style.display = "none"; }} />
                <div style={{ textAlign: "center", color: "#fff", fontSize: 12, marginTop: 8, opacity: .7 }}>{lightbox.name}</div>
                <button onClick={() => setLightbox(null)} style={{ position: "absolute", top: -12, right: -12, background: "#fff", border: "none", borderRadius: "50%", width: 28, height: 28, cursor: "pointer", fontSize: 14, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center" }}>×</button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Oil Change Modal */}
      {showOilChangeModal && (
        <OilChangeModal
          truck={truck}
          onClose={() => setShowOilChangeModal(false)}
          onConfirm={handleOilChangeConfirm}
        />
      )}

      {/* Upload Modal */}
      {uploadModal && (
        <UploadModal
          category={uploadModal.category}
          docList={uploadModal.category === "truck" ? TRUCK_DOC_LIST : DRIVER_DOC_LIST}
          onClose={() => setUploadModal(null)}
          onSave={handleSingleUpload}
        />
      )}

      {/* Assign Confirm Modal */}
      {assignConfirm && (() => {
        const d = drivers.find((x) => x.id === assignConfirm.driverId);
        if (!d) return null;
        return (
          <AssignConfirmModal
            driver={d}
            onClose={() => { setAssignConfirm(null); setPendingActiveStatus(false); }}
            onConfirm={(fields) => {
              // Save updated driver fields
              updateDriver(d.id, {
                dlExpiry:          fields.dlExpiry || d.dlExpiry || "",
                emptyMilesRate:    fields.emptyMilesRate  !== "" ? Number(fields.emptyMilesRate)  : d.emptyMilesRate,
                loadedMilesRate:   fields.loadedMilesRate !== "" ? Number(fields.loadedMilesRate) : d.loadedMilesRate,
                citizen:           fields.citizen,
                militaryLoads:     fields.militaryLoads,
                emergencyContacts: fields.emergencyContacts || d.emergencyContacts || [],
              });
              // Complete the assignment
              onAssignDriver(truck.id, d.id);
              // If triggered from status → Active, flip truck to active now
              if (pendingActiveStatus) {
                onUpd(truck.id, { status: "active" });
                setPendingActiveStatus(false);
              }
              setAssignConfirm(null);
            }}
          />
        );
      })()}
    </div>
  );
}
