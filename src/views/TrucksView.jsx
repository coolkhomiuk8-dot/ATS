import { useState, useMemo, useRef, useEffect } from "react";
import { useTrucksStore } from "../store/useTrucksStore";
import { useDriversStore } from "../store/useDriversStore";
import { TRUCK_STATUSES, TRUCK_DOC_LIST, DRIVER_DOC_LIST, OIL_CHANGE_INTERVAL, OIL_WARN_SOON, OIL_WARN_URGENT } from "../constants/truckData";
import { expiryStatus } from "../utils/date";
import TruckDrawer from "../components/TruckDrawer";
import { auth } from "../lib/firebase";

const driveMigrateEndpoint   = import.meta.env.VITE_DRIVE_MIGRATE_ENDPOINT   || "/.netlify/functions/driveMigrate";
const samsaraSyncEndpoint    = import.meta.env.VITE_SAMSARA_SYNC_ENDPOINT    || "/.netlify/functions/samsaraSync";
const samsaraVehiclesEndpoint = import.meta.env.VITE_SAMSARA_VEHICLES_ENDPOINT || "/.netlify/functions/samsaraVehicles";

function StatusBadge({ status }) {
  const s = TRUCK_STATUSES.find((x) => x.id === status) || TRUCK_STATUSES[3];
  return (
    <span style={{
      fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 20,
      background: s.bg, color: s.color, border: `1px solid ${s.color}44`,
      whiteSpace: "nowrap",
    }}>
      {s.label}
    </span>
  );
}

function oilColor(left) {
  if (left < 0) return "#dc2626";          // red — overdue
  if (left < OIL_WARN_URGENT) return "#f97316"; // orange — < 500 mi
  if (left < OIL_WARN_SOON)   return "#f59e0b"; // yellow — < 1000 mi
  return "#16a34a";                         // green — ok
}

function OilBar({ last, current }) {
  const left = OIL_CHANGE_INTERVAL - (Number(current) - Number(last));
  const pct = Math.max(0, Math.min(100, (left / OIL_CHANGE_INTERVAL) * 100));
  const color = oilColor(left);
  const label = left < 0
    ? `⚠ ${Math.abs(left).toLocaleString()} mi OVERDUE`
    : left < OIL_WARN_URGENT
      ? `🔴 ${left.toLocaleString()} mi left`
      : left < OIL_WARN_SOON
        ? `⚠ ${left.toLocaleString()} mi left`
        : `${left.toLocaleString()} mi left`;
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: "var(--text-faint)", marginBottom: 3 }}>
        <span>{Number(last).toLocaleString()} mi</span>
        <span style={{ color, fontWeight: 700 }}>{label}</span>
      </div>
      <div style={{ height: 4, borderRadius: 99, background: "var(--bg-hover)", overflow: "hidden" }}>
        <div style={{ height: "100%", width: `${pct}%`, background: color, borderRadius: 99, transition: "width .3s" }} />
      </div>
    </div>
  );
}

function DocBadge({ docName, category, files, docs, onUpload, onPreview, onCustomOpen }) {
  const fileRef = useRef(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState(null);

  const linked = (files || []).find((f) => f.linkedDoc === docName);
  const isImg = linked && (linked.type === "image" || /\.(jpg|jpeg|png|gif|webp|heic)$/i.test(linked.name || ""));
  const thumbUrl = linked?.driveFileId
    ? `https://drive.google.com/thumbnail?id=${linked.driveFileId}&sz=w80`
    : (linked?.url || linked?.data || null);
  // Green only when BOTH a file exists AND docs confirms it — prevents stale green after delete
  const hasFile = !!linked && !!(docs?.[docName]);

  function handleClick(e) {
    e.stopPropagation();
    if (uploading) return;
    setUploadError(null);
    // Custom handler overrides everything (e.g. Registration modal)
    if (onCustomOpen) { onCustomOpen(); return; }
    if (hasFile) {
      if (isImg && thumbUrl) onPreview(linked);
      else window.open(linked.url || linked.data, "_blank");
    } else {
      fileRef.current?.click();
    }
  }

  async function handleChange(e) {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    setUploading(true);
    setUploadError(null);
    try {
      await onUpload(f, docName, category);
    } catch (err) {
      const msg = String(err?.message || "Upload failed");
      setUploadError(msg);
      console.error(`DocBadge upload error [${docName}]:`, err);
    } finally {
      setUploading(false);
    }
  }

  const bg     = uploadError ? "#fef2f2" : uploading ? "#eff6ff" : hasFile ? "#dcfce7" : "var(--bg-raised)";
  const color  = uploadError ? "#dc2626" : uploading ? "#2563eb" : hasFile ? "#16a34a" : "var(--text-muted)";
  const border = uploadError ? "#fecaca" : uploading ? "#bfdbfe" : hasFile ? "#86efac" : "var(--border)";

  return (
    <span
      onClick={handleClick}
      title={
        uploading    ? "Uploading…" :
        uploadError  ? `Error: ${uploadError}` :
        hasFile      ? `Open ${docName}` :
                       `Upload ${docName}`
      }
      style={{
        position: "relative",
        display: "inline-flex", alignItems: "center", gap: 3,
        fontSize: 9, padding: "2px 6px", borderRadius: 5, fontWeight: 600,
        background: bg, color, border: `1px solid ${border}`,
        whiteSpace: "nowrap", cursor: uploading ? "wait" : "pointer",
        transition: "background .15s, color .15s",
      }}
      onMouseEnter={(e) => { if (!uploading) e.currentTarget.style.opacity = ".75"; }}
      onMouseLeave={(e) => { e.currentTarget.style.opacity = "1"; }}
    >
      {uploading
        ? <span style={{ display: "inline-block", width: 10, height: 10, border: "1.5px solid #2563eb", borderTopColor: "transparent", borderRadius: "50%", animation: "spin .6s linear infinite", flexShrink: 0 }} />
        : uploadError ? "⚠"
        : isImg && thumbUrl
          ? <img src={thumbUrl} alt="" style={{ width: 14, height: 14, borderRadius: 2, objectFit: "cover", flexShrink: 0 }} />
          : hasFile ? "📄" : "⬆"
      }
      {docName}
      <input
        ref={fileRef}
        type="file"
        accept="image/*,.pdf"
        style={{ display: "none" }}
        onChange={handleChange}
      />
    </span>
  );
}

function fmtPhone(raw) {
  if (!raw) return null;
  const digits = String(raw).replace(/\D/g, "");
  // strip leading 1 (US country code)
  const local = digits.startsWith("1") && digits.length === 11 ? digits.slice(1) : digits;
  if (local.length !== 10) return raw; // can't format — return as-is
  return `(${local.slice(0, 3)}) ${local.slice(3, 6)}-${local.slice(6)}`;
}

function TruckCard({ truck, driver, onClick, onUploadDoc, onPreviewDoc, onSetPlatesExpiry, onRegClick, onUploadDriverDoc }) {
  const vinShort = truck.vinNumber ? truck.vinNumber.slice(-4) : null;
  const oilLeft = OIL_CHANGE_INTERVAL - (Number(truck.currentOdometer) - Number(truck.lastOilChange));
  const files = truck.files || [];
  const [vinCopied, setVinCopied] = useState(false);
  const [phoneCopied, setPhoneCopied] = useState(false);
  const [platesEdit, setPlatesEdit] = useState(false);
  const [platesDate, setPlatesDate] = useState(truck.platesExpiry || "");
  const [platesSaving, setPlatesSaving] = useState(false);
  const platesRef = useRef(null);

  useEffect(() => {
    if (!platesEdit) return;
    function handleOutside(e) {
      if (platesRef.current && !platesRef.current.contains(e.target)) setPlatesEdit(false);
    }
    document.addEventListener("mousedown", handleOutside);
    return () => document.removeEventListener("mousedown", handleOutside);
  }, [platesEdit]);

  async function handleSavePlates(e) {
    e.stopPropagation();
    if (!platesDate) return;
    setPlatesSaving(true);
    try { await onSetPlatesExpiry(platesDate); } finally { setPlatesSaving(false); }
    setPlatesEdit(false);
  }

  function handleCopyVin(e) {
    e.stopPropagation();
    if (!truck.vinNumber) return;
    navigator.clipboard.writeText(truck.vinNumber).then(() => {
      setVinCopied(true);
      setTimeout(() => setVinCopied(false), 1500);
    });
  }

  function handleCopyPhone(e) {
    e.stopPropagation();
    if (!driver?.phone) return;
    const digits = driver.phone.replace(/\D/g, "");
    const local = digits.startsWith("1") && digits.length === 11 ? digits.slice(1) : digits;
    navigator.clipboard.writeText(local.length === 10 ? local : driver.phone).then(() => {
      setPhoneCopied(true);
      setTimeout(() => setPhoneCopied(false), 1500);
    });
  }

  return (
    <div
      onClick={onClick}
      style={{
        background: "var(--bg-surface)",
        border: "1px solid var(--border)",
        borderRadius: 12,
        padding: "12px 18px",
        cursor: "pointer",
        transition: "all .15s",
        display: "flex",
        alignItems: "center",
        gap: 0,
      }}
      onMouseEnter={(e) => { e.currentTarget.style.borderColor = "var(--color-primary)"; e.currentTarget.style.boxShadow = "0 2px 12px rgba(37,99,235,.08)"; }}
      onMouseLeave={(e) => { e.currentTarget.style.borderColor = "var(--border)"; e.currentTarget.style.boxShadow = "none"; }}
    >
      {/* Col 1 — Unit + status */}
      <div style={{ minWidth: 120, flexShrink: 0, paddingRight: 16, borderRight: "1px solid var(--border)" }}>
        <div style={{ fontSize: 20, fontWeight: 800, color: "var(--text-primary)", letterSpacing: "-1px", lineHeight: 1.1 }}>
          Unit {truck.unitNumber || "—"}
        </div>
        <div style={{ marginTop: 5 }}>
          <StatusBadge status={truck.status} />
        </div>
        {truck.year && <div style={{ fontSize: 11, color: "var(--text-faint)", marginTop: 4 }}>{truck.year}</div>}
        {vinShort && (
          <div
            onClick={handleCopyVin}
            title={vinCopied ? "Copied!" : `Copy VIN: ${truck.vinNumber}`}
            style={{
              marginTop: 4, display: "inline-flex", alignItems: "center", gap: 3,
              fontSize: 13, fontWeight: 700, fontFamily: "monospace", letterSpacing: "0.08em",
              color: vinCopied ? "#16a34a" : "var(--text-secondary)",
              background: vinCopied ? "#f0fdf4" : "var(--bg-hover)",
              border: `1px solid ${vinCopied ? "#86efac" : "var(--border)"}`,
              borderRadius: 5, padding: "2px 7px", cursor: "pointer",
              transition: "all .15s", userSelect: "none",
            }}
            onMouseEnter={(e) => { if (!vinCopied) { e.currentTarget.style.borderColor = "var(--color-primary)"; e.currentTarget.style.color = "var(--color-primary)"; } }}
            onMouseLeave={(e) => { if (!vinCopied) { e.currentTarget.style.borderColor = "var(--border)"; e.currentTarget.style.color = "var(--text-secondary)"; } }}
          >
            {vinCopied ? "✓ " : "VIN "}{vinShort}
          </div>
        )}
        {/* Plates expiry badge + inline popover */}
        {(() => {
          const exp = expiryStatus(truck.platesExpiry);
          const badgeStyle = truck.platesExpiry
            ? { background: exp.color + "18", color: exp.color, border: `1px solid ${exp.border}` }
            : { background: "var(--bg-hover)", color: "var(--text-disabled)", border: "1px solid var(--border)" };
          const label = !truck.platesExpiry
            ? "Plates —"
            : exp.daysLeft < 0 ? "Plates EXP"
            : `Plates ${exp.daysLeft}d`;
          return (
            <div ref={platesRef} style={{ position: "relative", marginTop: 5, display: "inline-block" }}>
              <span
                onClick={(e) => { e.stopPropagation(); setPlatesDate(truck.platesExpiry || ""); setPlatesEdit((v) => !v); }}
                title="Set plates expiry date"
                style={{
                  display: "inline-flex", alignItems: "center", gap: 3,
                  fontSize: 9, fontWeight: truck.platesExpiry ? 700 : 600,
                  padding: "2px 6px", borderRadius: 4, cursor: "pointer",
                  userSelect: "none", ...badgeStyle,
                }}
              >
                {truck.platesExpiry ? "🪪 " : "📋 "}{label}
              </span>

              {platesEdit && (
                <div
                  onClick={(e) => e.stopPropagation()}
                  style={{
                    position: "absolute", top: "calc(100% + 6px)", left: 0, zIndex: 500,
                    background: "var(--bg-surface)", border: "1px solid var(--border)",
                    borderRadius: 10, padding: "12px 14px", boxShadow: "0 8px 32px rgba(0,0,0,.18)",
                    minWidth: 210,
                  }}
                >
                  <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text-muted)", marginBottom: 7 }}>
                    📋 Plates Expiry Date
                  </div>
                  <input
                    type="date"
                    value={platesDate}
                    onChange={(e) => setPlatesDate(e.target.value)}
                    autoFocus
                    style={{
                      width: "100%", padding: "7px 9px", fontSize: 13, boxSizing: "border-box",
                      background: "var(--bg-raised)", border: "1px solid var(--border)",
                      borderRadius: 7, color: "var(--text-primary)", outline: "none", marginBottom: 9,
                    }}
                  />
                  <div style={{ display: "flex", gap: 6 }}>
                    <button
                      onClick={handleSavePlates}
                      disabled={!platesDate || platesSaving}
                      style={{
                        flex: 1, padding: "7px", borderRadius: 7, border: "none", fontSize: 12,
                        fontWeight: 700, cursor: platesDate && !platesSaving ? "pointer" : "default",
                        background: platesDate ? "var(--color-primary)" : "var(--text-disabled)", color: "#fff",
                      }}
                    >
                      {platesSaving ? "Saving…" : "Save"}
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); setPlatesEdit(false); }}
                      style={{ padding: "7px 11px", borderRadius: 7, border: "1px solid var(--border)", background: "var(--bg-raised)", color: "var(--text-muted)", fontSize: 12, cursor: "pointer" }}
                    >
                      ✕
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        })()}
      </div>

      {/* Col 2 — Insurance */}
      <div style={{ minWidth: 180, flexShrink: 0, padding: "0 16px", borderRight: "1px solid var(--border)", display: "flex", flexDirection: "column", gap: 4 }}>
        <div style={{ fontSize: 10, fontWeight: 700, color: "var(--text-faint)", textTransform: "uppercase", letterSpacing: ".05em", marginBottom: 2 }}>Insurance</div>
        <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 7px", borderRadius: 4, background: truck.autoLiabilityCompany ? "#f0fdf4" : "#fef2f2", color: truck.autoLiabilityCompany ? "#15803d" : "#dc2626", border: `1px solid ${truck.autoLiabilityCompany ? "#86efac" : "#fecaca"}`, whiteSpace: "nowrap" }}>
          {truck.autoLiabilityCompany ? `✓ AL: ${truck.autoLiabilityCompany}` : "⚠ Auto Liability"}
        </span>
        <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 7px", borderRadius: 4, background: truck.cargoInsuranceCompany ? "#f0fdf4" : "#fef2f2", color: truck.cargoInsuranceCompany ? "#15803d" : "#dc2626", border: `1px solid ${truck.cargoInsuranceCompany ? "#86efac" : "#fecaca"}`, whiteSpace: "nowrap" }}>
          {truck.cargoInsuranceCompany ? `✓ Cargo: ${truck.cargoInsuranceCompany}` : "⚠ Cargo"}
        </span>
        {/* Driver insurance — same style */}
        {driver && (driver.insuranceCompanies || []).length > 0
          ? (driver.insuranceCompanies || []).map((c) => (
              <span key={c} style={{ fontSize: 10, fontWeight: 700, padding: "2px 7px", borderRadius: 4, background: "#f0fdf4", color: "#15803d", border: "1px solid #86efac", whiteSpace: "nowrap" }}>
                ✓ Driver: {c}
              </span>
            ))
          : driver && (
              <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 7px", borderRadius: 4, background: "#fef2f2", color: "#dc2626", border: "1px solid #fecaca", whiteSpace: "nowrap" }}>
                ⚠ Driver ins.
              </span>
            )
        }
      </div>

      {/* Col 3 — Driver */}
      <div style={{ minWidth: 160, flexShrink: 0, padding: "0 16px", borderRight: "1px solid var(--border)", display: "flex", flexDirection: "column", gap: 4 }}>
        <div style={{ fontSize: 10, fontWeight: 700, color: "var(--text-faint)", textTransform: "uppercase", letterSpacing: ".05em", marginBottom: 2 }}>Driver</div>
        <div style={{ fontSize: 12, fontWeight: driver ? 600 : 400, color: driver ? "var(--color-primary-dark)" : "var(--text-faint)" }}>
          {driver ? `🚗 ${driver.name}` : "Available"}
        </div>
        {driver?.phone && (
          <div
            onClick={handleCopyPhone}
            title={phoneCopied ? "Copied!" : "Copy phone"}
            style={{
              display: "inline-flex", alignItems: "center", gap: 4,
              fontSize: 12, fontWeight: 500, fontFamily: "monospace", letterSpacing: "0.03em",
              color: phoneCopied ? "#16a34a" : "var(--text-secondary)",
              cursor: "pointer", userSelect: "none",
              transition: "color .15s",
            }}
          >
            {phoneCopied ? "✓ Copied" : fmtPhone(driver.phone)}
          </div>
        )}
      </div>

      {/* Col 4 — Oil */}
      <div style={{ minWidth: 180, flexShrink: 0, padding: "0 16px", borderRight: "1px solid var(--border)" }}>
        <div style={{ fontSize: 10, fontWeight: 700, color: "var(--text-faint)", textTransform: "uppercase", letterSpacing: ".05em", marginBottom: 6 }}>Oil Change</div>
        {(truck.lastOilChange || truck.currentOdometer)
          ? <OilBar last={truck.lastOilChange} current={truck.currentOdometer} />
          : <span style={{ fontSize: 11, color: "var(--text-disabled)" }}>No data</span>
        }
        {truck.fuelCard && <div style={{ fontSize: 10, color: "var(--text-muted)", fontFamily: "monospace", marginTop: 5 }}>💳 {truck.fuelCard}</div>}
      </div>

      {/* Col 5 — Live (Samsara) */}
      <div style={{ minWidth: 155, flexShrink: 0, padding: "0 16px", borderRight: "1px solid var(--border)", display: "flex", flexDirection: "column", gap: 5 }}>
        <div style={{ fontSize: 10, fontWeight: 700, color: "var(--text-faint)", textTransform: "uppercase", letterSpacing: ".05em", marginBottom: 2 }}>Live</div>

        {/* Engine state + speed */}
        {(() => {
          const hasSynced = !!truck.lastSamsaraSync;
          const state = truck.engineState;
          const speed = truck.gpsData?.speed ?? 0;
          if (!hasSynced) return <span style={{ fontSize: 10, color: "var(--text-disabled)" }}>No sync yet</span>;
          if (!state) return <span style={{ fontSize: 10, color: "var(--text-disabled)" }}>⭕ Off / no data</span>;
          const isOff  = state === "Off";
          const isIdle = state === "Idle";
          const icon   = isOff ? "⭕" : isIdle ? "🟡" : "🟢";
          const label  = isOff ? "Off" : isIdle ? "Idle" : speed > 0 ? `${speed} mph` : "On";
          const color  = isOff ? "var(--text-disabled)" : isIdle ? "#d97706" : "#16a34a";
          return (
            <div style={{ fontSize: 11, fontWeight: 700, color }}>
              {icon} {label}
            </div>
          );
        })()}

        {/* Fuel bar */}
        {truck.fuelPercent != null && (() => {
          const pct   = Math.round(truck.fuelPercent);
          const color = pct < 20 ? "#dc2626" : pct < 50 ? "#f59e0b" : "#16a34a";
          return (
            <div>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: "var(--text-faint)", marginBottom: 2 }}>
                <span>⛽ Fuel</span>
                <span style={{ color, fontWeight: 700 }}>{pct}%</span>
              </div>
              <div style={{ height: 4, borderRadius: 99, background: "var(--bg-hover)", overflow: "hidden" }}>
                <div style={{ height: "100%", width: `${pct}%`, background: color, borderRadius: 99, transition: "width .3s" }} />
              </div>
            </div>
          );
        })()}

        {/* GPS location */}
        {truck.gpsData?.location && (
          <div style={{ fontSize: 10, color: "var(--text-muted)", fontWeight: 600 }}>
            📍 {truck.gpsData.location}
          </div>
        )}

        {/* Fault codes */}
        {(() => {
          const faults = Array.isArray(truck.faultCodes) ? truck.faultCodes : [];
          if (faults.length === 0) return null;
          const hasRed = faults.some((f) => f.lamp === "red");
          const color  = hasRed ? "#dc2626" : "#f97316";
          const bg     = hasRed ? "#fef2f2" : "#fff7ed";
          const border = hasRed ? "#fecaca" : "#fed7aa";
          return (
            <div
              title={faults.map((f) => `SPN ${f.j1939Spn} FMI ${f.j1939Fmi}${f.lamp ? ` (${f.lamp})` : ""}`).join("\n")}
              style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 10, fontWeight: 700, padding: "2px 7px", borderRadius: 5, background: bg, color, border: `1px solid ${border}`, cursor: "default" }}
            >
              ⚠ {faults.length} fault{faults.length !== 1 ? "s" : ""}
            </div>
          );
        })()}

        {/* Last sync time */}
        {truck.lastSamsaraSync && (
          <div style={{ fontSize: 9, color: "var(--text-disabled)", marginTop: "auto" }}>
            {(() => {
              const diff = Math.round((Date.now() - new Date(truck.lastSamsaraSync).getTime()) / 60000);
              return diff < 1 ? "synced just now" : diff < 60 ? `synced ${diff}m ago` : `synced ${Math.round(diff/60)}h ago`;
            })()}
          </div>
        )}
      </div>

      {/* Col 5 — Docs */}
      <div style={{ flex: 1, padding: "0 0 0 16px", display: "flex", flexDirection: "column", gap: 6 }}>
        <div>
          <div style={{ fontSize: 9, fontWeight: 700, color: "var(--text-faint)", textTransform: "uppercase", letterSpacing: ".05em", marginBottom: 4 }}>Truck Docs</div>
          <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
            {TRUCK_DOC_LIST.map((doc) => (
              <DocBadge
                key={doc} docName={doc} category="truck"
                files={files} docs={truck.docs}
                onUpload={onUploadDoc} onPreview={onPreviewDoc}
                onCustomOpen={doc === "Registration" ? () => onRegClick(doc) : undefined}
              />
            ))}
          </div>
        </div>
        <div>
          <div style={{ fontSize: 9, fontWeight: 700, color: "var(--text-faint)", textTransform: "uppercase", letterSpacing: ".05em", marginBottom: 4 }}>Driver Docs</div>
          {driver ? (
            <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
              {DRIVER_DOC_LIST.map((doc) => (
                <DocBadge
                  key={doc} docName={doc} category="driver"
                  files={driver.files || []} docs={driver.docs || {}}
                  onUpload={(rawFile, docName, category) => onUploadDriverDoc(driver.id, rawFile, docName, category)}
                  onPreview={onPreviewDoc}
                />
              ))}
            </div>
          ) : (
            <div style={{ fontSize: 11, color: "var(--text-disabled)", fontStyle: "italic" }}>No driver assigned</div>
          )}
        </div>
        {truck.eldId && <div style={{ fontSize: 10, color: "var(--text-muted)" }}>ELD: {truck.eldId}</div>}
        {truck.statusNote && <div style={{ fontSize: 11, color: "var(--text-muted)", fontStyle: "italic" }}>{truck.statusNote}</div>}
      </div>
    </div>
  );
}

export default function TrucksView({ onAddDriver }) {
  const { trucks, addTruck, updateTruck, deleteTruck, assignDriver, unassignDriver, addTruckFile } = useTrucksStore();
  const { drivers, addFile: addDriverFile, upd: updDriver } = useDriversStore();

  const [selectedId, setSelectedId] = useState(null);
  const [showAdd, setShowAdd] = useState(false);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState(
    () => localStorage.getItem("fleet_statusFilter") || "all"
  );

  function setStatusFilterPersist(val) {
    localStorage.setItem("fleet_statusFilter", val);
    setStatusFilter(val);
  }
  const [sortBy, setSortBy] = useState("unit_asc");
  const [lightbox, setLightbox] = useState(null); // { url, name }

  // ── Samsara sync ───────────────────────────────────────────────────────────
  const [samsaraRunning, setSamsaraRunning] = useState(false);
  const [samsaraResult,  setSamsaraResult]  = useState(null);
  const [showSamsara,    setShowSamsara]    = useState(false);

  async function handleSamsaraSync() {
    if (samsaraRunning) return;
    setSamsaraRunning(true);
    setSamsaraResult(null);
    try {
      if (!auth?.currentUser) throw new Error("Not signed in.");
      const idToken = await auth.currentUser.getIdToken();
      const res = await fetch(samsaraSyncEndpoint, {
        method: "POST",
        headers: { Authorization: `Bearer ${idToken}` },
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || `Sync failed (${res.status})`);
      setSamsaraResult(data);
    } catch (err) {
      setSamsaraResult({ error: String(err?.message || "Unknown error") });
    } finally {
      setSamsaraRunning(false);
    }
  }
  // ──────────────────────────────────────────────────────────────────────────

  const [showMigrate, setShowMigrate]   = useState(false);
  const [migrateRunning, setMigrateRunning] = useState(false);
  const [migrateResult, setMigrateResult]   = useState(null); // null | { success, totalMoved, report } | { error }

  async function handleRunMigration() {
    if (migrateRunning) return;
    setMigrateRunning(true);
    setMigrateResult(null);
    try {
      if (!auth?.currentUser) throw new Error("Not signed in.");
      const idToken = await auth.currentUser.getIdToken();
      const res = await fetch(driveMigrateEndpoint, {
        method: "POST",
        headers: { Authorization: `Bearer ${idToken}` },
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || `Migration failed (${res.status})`);
      setMigrateResult(data);
    } catch (err) {
      setMigrateResult({ error: String(err?.message || "Unknown error") });
    } finally {
      setMigrateRunning(false);
    }
  }

  const SORT_OPTIONS = [
    { id: "unit_asc",     label: "Unit # ↑",          icon: "🔢" },
    { id: "unit_desc",    label: "Unit # ↓",          icon: "🔢" },
    { id: "newest",       label: "Newest first",       icon: "🕐" },
    { id: "oldest",       label: "Oldest first",       icon: "🕐" },
    { id: "oil_critical", label: "Oil: most urgent",   icon: "🛢" },
  ];

  // Registration / Plates modal
  const [regModal, setRegModal] = useState(null); // { truckId, docName } | null
  const [regDate, setRegDate] = useState("");
  const [regFile, setRegFile] = useState(null);   // raw File object
  const [regSaving, setRegSaving] = useState(false);
  const [regError, setRegError] = useState(null);
  const regFileRef = useRef(null);

  function openRegModal(truckId, docName) {
    const truck = trucks.find((t) => t.id === truckId);
    setRegDate(truck?.platesExpiry || "");
    setRegFile(null);
    setRegError(null);
    setRegModal({ truckId, docName });
  }

  async function handleSaveReg() {
    if (!regModal) return;
    setRegSaving(true);
    setRegError(null);
    try {
      const { truckId, docName } = regModal;
      if (regFile) await handleDocUpload(truckId, regFile, docName, "truck");
      if (regDate) await updateTruck(truckId, { platesExpiry: regDate });
      setRegModal(null);
    } catch (err) {
      setRegError(String(err?.message || "Failed to save."));
    } finally {
      setRegSaving(false);
    }
  }

  async function handleDocUpload(truckId, rawFile, docName, category) {
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
    await addTruckFile(truckId, fileObj);
    const truck = trucks.find((t) => t.id === truckId);
    if (truck) updateTruck(truckId, { docs: { ...(truck.docs || {}), [docName]: true } });
  }

  async function handleDriverDocUpload(driverId, rawFile, docName, category) {
    const driver = drivers.find((d) => d.id === driverId);
    if (!driver) return;
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
    await addDriverFile(driverId, fileObj);
    // mark doc as received on the driver
    const fresh = drivers.find((d) => d.id === driverId);
    if (fresh) updDriver(driverId, { docs: { ...(fresh.docs || {}), [docName]: true } });
  }

  const [form, setForm] = useState({
    unitNumber: "", year: "", vinNumber: "",
    status: "available",
    statusNote: "", homeLocation: "", fuelCard: "",
    lastOilChange: "", currentOdometer: "", notes: "",
    autoLiabilityStatus: "none", autoLiabilityCompany: "",
    cargoInsuranceStatus: "none", cargoInsuranceCompany: "",
  });
  const [addError, setAddError] = useState(null);

  function setF(key, val) { setForm((p) => ({ ...p, [key]: val })); setAddError(null); }

  async function handleAdd() {
    if (!form.unitNumber.trim()) return;
    setAddError(null);
    try {
      await addTruck(form);
      setForm({
        unitNumber: "", year: "", vinNumber: "",
        status: "available",
        statusNote: "", homeLocation: "", fuelCard: "",
        lastOilChange: "", currentOdometer: "", notes: "",
        autoLiabilityStatus: "none", autoLiabilityCompany: "",
        cargoInsuranceStatus: "none", cargoInsuranceCompany: "",
      });
      setShowAdd(false);
    } catch (err) {
      setAddError(String(err?.message || "Failed to add truck."));
    }
  }

  const selectedTruck = trucks.find((t) => t.id === selectedId) || null;

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = trucks.filter((t) => {
      if (statusFilter !== "all" && t.status !== statusFilter) return false;
      if (!q) return true;
      const driverName = t.assignedDriverId
        ? (drivers.find((d) => d.id === t.assignedDriverId)?.name || "").toLowerCase()
        : "";
      return (
        String(t.unitNumber).toLowerCase().includes(q) ||
        String(t.vinNumber).toLowerCase().includes(q) ||
        driverName.includes(q)
      );
    });

    return [...list].sort((a, b) => {
      if (sortBy === "unit_asc") {
        return String(a.unitNumber).localeCompare(String(b.unitNumber), undefined, { numeric: true });
      }
      if (sortBy === "unit_desc") {
        return String(b.unitNumber).localeCompare(String(a.unitNumber), undefined, { numeric: true });
      }
      if (sortBy === "newest") {
        return (b.createdAt || "").localeCompare(a.createdAt || "");
      }
      if (sortBy === "oldest") {
        return (a.createdAt || "").localeCompare(b.createdAt || "");
      }
      if (sortBy === "oil_critical") {
        const oilLeft = (t) => OIL_CHANGE_INTERVAL - (Number(t.currentOdometer) - Number(t.lastOilChange));
        return oilLeft(a) - oilLeft(b); // lowest (most urgent) first
      }
      return 0;
    });
  }, [trucks, search, statusFilter, sortBy, drivers]);

  // Stats
  const total = trucks.length;
  const activeCount = trucks.filter((t) => t.status === "active").length;
  const maintenanceCount = trucks.filter((t) => t.status === "maintenance").length;
  const availableCount = trucks.filter((t) => t.status === "available").length;

  const labelStyle = { fontSize: 11, color: "var(--text-faint)", marginBottom: 3, fontWeight: 600 };
  const inputStyle = {
    width: "100%", padding: "8px 10px", fontSize: 13,
    background: "var(--bg-raised)", border: "1px solid var(--border)",
    borderRadius: 8, color: "var(--text-primary)", outline: "none", boxSizing: "border-box",
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", background: "var(--bg-app)", overflow: "hidden" }}>
      {/* Top bar */}
      <div style={{
        background: "var(--bg-surface)", borderBottom: "1px solid var(--border)",
        padding: "12px 20px", display: "flex", alignItems: "center", gap: 12, flexShrink: 0,
      }}>
        <div style={{ flexShrink: 0 }}>
          <div style={{ fontSize: 16, fontWeight: 800, color: "var(--text-primary)" }}>Fleet Management</div>
          <div style={{ fontSize: 12, color: "var(--text-faint)", marginTop: 1 }}>{total} truck{total !== 1 ? "s" : ""}</div>
        </div>

        {/* Stats pills */}
        <div style={{ display: "flex", gap: 6 }}>
          {[
            { label: "Total", count: total, color: "#6366f1", bg: "#eef2ff" },
            { label: "Active", count: activeCount, color: "#16a34a", bg: "#f0fdf4" },
            { label: "Maintenance", count: maintenanceCount, color: "#dc2626", bg: "#fef2f2" },
            { label: "Available", count: availableCount, color: "#2563eb", bg: "#eff6ff" },
          ].map((s) => (
            <span key={s.label} style={{
              fontSize: 12, fontWeight: 700, padding: "4px 10px", borderRadius: 20,
              background: s.bg, color: s.color, border: `1px solid ${s.color}33`,
            }}>
              {s.count} {s.label}
            </span>
          ))}
        </div>

        {/* Search */}
        <div style={{ position: "relative", flex: "0 0 220px", marginLeft: "auto" }}>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search unit, VIN, driver..."
            style={{
              width: "100%", padding: "8px 28px 8px 12px", fontSize: 13,
              background: "var(--bg-raised)", border: "1px solid var(--border)",
              borderRadius: 9, color: "var(--text-primary)", outline: "none",
            }}
          />
          {search && (
            <button onClick={() => setSearch("")} style={{
              position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)",
              background: "none", border: "none", color: "var(--text-faint)", fontSize: 14, cursor: "pointer", padding: 0,
            }}>×</button>
          )}
        </div>

        {/* Sort */}
        <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="var(--text-faint)" strokeWidth="1.8" strokeLinecap="round">
            <line x1="2" y1="4" x2="14" y2="4"/>
            <line x1="4" y1="8" x2="12" y2="8"/>
            <line x1="6" y1="12" x2="10" y2="12"/>
          </svg>
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value)}
            style={{
              padding: "8px 10px", fontSize: 12, fontWeight: 600,
              background: "var(--bg-raised)", border: "1px solid var(--border)",
              borderRadius: 9, color: "var(--text-secondary)", outline: "none",
              cursor: "pointer",
            }}
          >
            {SORT_OPTIONS.map((o) => (
              <option key={o.id} value={o.id}>{o.icon} {o.label}</option>
            ))}
          </select>
        </div>

        <button
          onClick={() => { setSamsaraResult(null); setShowSamsara(true); }}
          title="Sync odometer & fault codes from Samsara"
          style={{
            background: samsaraRunning ? "#eff6ff" : "var(--bg-raised)",
            border: "1px solid var(--border)", color: "var(--text-secondary)",
            padding: "8px 14px", borderRadius: 9, fontSize: 13, fontWeight: 600, cursor: "pointer",
            flexShrink: 0, display: "flex", alignItems: "center", gap: 5,
          }}
        >
          {samsaraRunning
            ? <span style={{ display: "inline-block", width: 12, height: 12, border: "2px solid #2563eb", borderTopColor: "transparent", borderRadius: "50%", animation: "spin .6s linear infinite" }} />
            : "📡"}
          Samsara
        </button>

        <button
          onClick={() => { setMigrateResult(null); setShowMigrate(true); }}
          title="Reorganise all Drive files into the current folder structure"
          style={{
            background: "var(--bg-raised)", border: "1px solid var(--border)", color: "var(--text-secondary)",
            padding: "8px 14px", borderRadius: 9, fontSize: 13, fontWeight: 600, cursor: "pointer",
            flexShrink: 0, display: "flex", alignItems: "center", gap: 5,
          }}
        >
          🗂 Drive Sync
        </button>

        <button
          onClick={() => { setAddError(null); setShowAdd(true); }}
          style={{
            background: "var(--color-primary)", border: "none", color: "#fff",
            padding: "9px 18px", borderRadius: 9, fontSize: 13, fontWeight: 600, cursor: "pointer",
            flexShrink: 0,
          }}
        >
          + Add Truck
        </button>
      </div>

      {/* Status filter tabs */}
      <div style={{
        display: "flex", gap: 0, padding: "0 20px",
        background: "var(--bg-surface)", borderBottom: "1px solid var(--border)", flexShrink: 0,
      }}>
        {[{ id: "all", label: "All" }, ...TRUCK_STATUSES].map((s) => (
          <button
            key={s.id}
            onClick={() => setStatusFilterPersist(s.id)}
            style={{
              padding: "10px 16px", border: "none", borderBottom: statusFilter === s.id ? "2px solid var(--color-primary)" : "2px solid transparent",
              background: "transparent", cursor: "pointer", fontSize: 13, fontWeight: statusFilter === s.id ? 700 : 500,
              color: statusFilter === s.id ? "var(--color-primary)" : "var(--text-muted)",
              transition: "all .15s",
            }}
          >
            {s.label}
            {s.id !== "all" && (
              <span style={{ marginLeft: 5, fontSize: 10, opacity: .7 }}>
                {trucks.filter((t) => t.status === s.id).length}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Grid */}
      <div style={{ flex: 1, overflowY: "auto", padding: 20 }}>
        {filtered.length === 0 ? (
          <div style={{ textAlign: "center", padding: "60px 0", fontSize: 14, color: "var(--text-faint)" }}>
            {trucks.length === 0 ? "No trucks yet — click + Add Truck to get started." : "No trucks match your search."}
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {filtered.map((truck) => {
              const driver = truck.assignedDriverId
                ? drivers.find((d) => d.id === truck.assignedDriverId)
                : null;
              return (
                <TruckCard
                  key={truck.id}
                  truck={truck}
                  driver={driver}
                  onClick={() => setSelectedId(truck.id)}
                  onUploadDoc={(rawFile, docName, category) => handleDocUpload(truck.id, rawFile, docName, category)}
                  onPreviewDoc={(file) => {
                    const url = file.driveFileId
                      ? `https://drive.google.com/thumbnail?id=${file.driveFileId}&sz=w1200`
                      : (file.url || file.data);
                    setLightbox({ url, name: file.name });
                  }}
                  onSetPlatesExpiry={(date) => updateTruck(truck.id, { platesExpiry: date })}
                  onRegClick={(docName) => openRegModal(truck.id, docName)}
                  onUploadDriverDoc={handleDriverDocUpload}
                />
              );
            })}
          </div>
        )}
      </div>

      {/* Lightbox */}
      {lightbox && (
        <div onClick={() => setLightbox(null)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.88)", zIndex: 9999, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
          <div onClick={(e) => e.stopPropagation()} style={{ position: "relative", maxWidth: "92vw", maxHeight: "92vh" }}>
            <img src={lightbox.url} alt={lightbox.name} style={{ maxWidth: "100%", maxHeight: "88vh", borderRadius: 10, boxShadow: "0 20px 60px rgba(0,0,0,.5)", display: "block" }} />
            <div style={{ textAlign: "center", color: "#fff", fontSize: 12, marginTop: 8, opacity: .6 }}>{lightbox.name}</div>
            <button onClick={() => setLightbox(null)} style={{ position: "absolute", top: -14, right: -14, background: "#fff", border: "none", borderRadius: "50%", width: 30, height: 30, cursor: "pointer", fontSize: 16, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 2px 8px rgba(0,0,0,.3)" }}>×</button>
          </div>
        </div>
      )}

      {/* Truck drawer */}
      {selectedTruck && (
        <>
          <div onClick={() => setSelectedId(null)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.2)", zIndex: 299 }} />
          <TruckDrawer
            truck={selectedTruck}
            drivers={drivers}
            onClose={() => setSelectedId(null)}
            onUpd={updateTruck}
            onDelete={(id) => { deleteTruck(id); setSelectedId(null); }}
            onAssignDriver={assignDriver}
            onUnassignDriver={unassignDriver}
          />
        </>
      )}

      {/* Registration / Plates modal */}
      {regModal && (
        <div
          onClick={() => { if (!regSaving) setRegModal(null); }}
          style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,.5)", zIndex: 600, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{ background: "var(--bg-surface)", borderRadius: 16, width: "100%", maxWidth: 400, padding: "26px 28px", boxShadow: "0 20px 60px rgba(0,0,0,.25)" }}
          >
            <div style={{ fontSize: 17, fontWeight: 700, color: "var(--text-primary)", marginBottom: 18 }}>
              🪪 {regModal.docName}
            </div>

            {/* Expiry date */}
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text-muted)", marginBottom: 6 }}>EXPIRY DATE</div>
              <input
                type="date"
                value={regDate}
                onChange={(e) => setRegDate(e.target.value)}
                autoFocus
                style={{
                  width: "100%", padding: "10px 12px", fontSize: 14, boxSizing: "border-box",
                  background: "var(--bg-raised)", border: "1px solid var(--border)",
                  borderRadius: 9, color: "var(--text-primary)", outline: "none",
                }}
              />
            </div>

            {/* File upload area */}
            <div style={{ marginBottom: 18 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text-muted)", marginBottom: 6 }}>DOCUMENT / PHOTO</div>
              {regFile ? (
                <div style={{ display: "flex", alignItems: "center", gap: 10, background: "var(--bg-raised)", border: "1px solid var(--border)", borderRadius: 9, padding: "10px 12px" }}>
                  <span style={{ fontSize: 20 }}>{regFile.type.startsWith("image/") ? "🖼" : "📄"}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{regFile.name}</div>
                    <div style={{ fontSize: 11, color: "var(--text-faint)" }}>{(regFile.size / 1024).toFixed(0)} KB</div>
                  </div>
                  <button onClick={() => setRegFile(null)} style={{ background: "none", border: "none", color: "var(--text-faint)", fontSize: 16, cursor: "pointer", padding: "0 4px" }}>✕</button>
                </div>
              ) : (
                <div
                  onClick={() => regFileRef.current?.click()}
                  style={{
                    border: "2px dashed var(--border)", borderRadius: 9, padding: "20px",
                    textAlign: "center", cursor: "pointer", color: "var(--text-muted)",
                    fontSize: 13, transition: "border-color .15s, background .15s",
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.borderColor = "var(--color-primary)"; e.currentTarget.style.background = "var(--bg-hover)"; }}
                  onMouseLeave={(e) => { e.currentTarget.style.borderColor = "var(--border)"; e.currentTarget.style.background = "transparent"; }}
                >
                  <div style={{ fontSize: 22, marginBottom: 4 }}>⬆</div>
                  Click to upload photo or PDF
                </div>
              )}
              <input
                ref={regFileRef}
                type="file"
                accept="image/*,.pdf"
                style={{ display: "none" }}
                onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) setRegFile(f); }}
              />
            </div>

            {regError && (
              <div style={{ background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 8, padding: "8px 12px", fontSize: 13, color: "#dc2626", marginBottom: 14 }}>
                ⚠ {regError}
              </div>
            )}

            <div style={{ display: "flex", gap: 8 }}>
              <button
                onClick={handleSaveReg}
                disabled={(!regDate && !regFile) || regSaving}
                style={{
                  flex: 1, padding: "11px", borderRadius: 9, border: "none", fontSize: 14,
                  fontWeight: 700, cursor: (regDate || regFile) && !regSaving ? "pointer" : "default",
                  background: (regDate || regFile) ? "var(--color-primary)" : "var(--text-disabled)", color: "#fff",
                  display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
                }}
              >
                {regSaving
                  ? <><span style={{ display: "inline-block", width: 14, height: 14, border: "2px solid #fff", borderTopColor: "transparent", borderRadius: "50%", animation: "spin .6s linear infinite" }} /> Saving…</>
                  : "Save"
                }
              </button>
              <button
                onClick={() => setRegModal(null)}
                disabled={regSaving}
                style={{ padding: "11px 16px", borderRadius: 9, border: "1px solid var(--border)", background: "var(--bg-raised)", color: "var(--text-muted)", fontSize: 13, cursor: "pointer" }}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Samsara sync modal */}
      {showSamsara && (
        <div
          onClick={() => { if (!samsaraRunning) setShowSamsara(false); }}
          style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,.5)", zIndex: 450, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{ background: "var(--bg-surface)", borderRadius: 16, width: "100%", maxWidth: 440, padding: 28, boxShadow: "0 20px 60px rgba(0,0,0,.28)" }}
          >
            <div style={{ fontSize: 17, fontWeight: 700, color: "var(--text-primary)", marginBottom: 6 }}>📡 Samsara Sync</div>
            <div style={{ fontSize: 13, color: "var(--text-muted)", marginBottom: 20, lineHeight: 1.6 }}>
              Pulls live data from Samsara and updates your trucks:
              <ul style={{ margin: "8px 0 0 18px", padding: 0, lineHeight: 1.9 }}>
                <li><strong>Odometer</strong> — updates Current Odometer (mi) from OBD</li>
                <li><strong>Fault Codes</strong> — active DTCs shown as ⚠ badge on card</li>
                <li><strong>Auto-link</strong> — matches trucks by VIN automatically</li>
              </ul>
            </div>

            {samsaraResult && !samsaraResult.error && (
              <div style={{ background: "#f0fdf4", border: "1px solid #86efac", borderRadius: 10, padding: "14px 16px", marginBottom: 18 }}>
                <div style={{ fontWeight: 700, color: "#15803d", marginBottom: 8 }}>✅ Sync complete</div>
                <div style={{ fontSize: 12, color: "#166534", lineHeight: 1.8 }}>
                  {(() => {
                    const r = samsaraResult.report || {};
                    const d = samsaraResult.debug || {};
                    return <>
                      <div>✓ {r.synced} truck{r.synced !== 1 ? "s" : ""} updated</div>
                      {r.autoLinked > 0 && <div>🔗 {r.autoLinked} auto-linked by VIN</div>}
                      {r.noMatch > 0  && <div style={{ color: "#92400e" }}>⚠ {r.noMatch} not matched</div>}
                      {(r.errors || []).map((e, i) => <div key={i} style={{ color: "#dc2626" }}>✗ {e}</div>)}
                      {Object.keys(d).length > 0 && (
                        <div style={{ marginTop: 8, paddingTop: 8, borderTop: "1px solid #86efac", color: "#166534", fontFamily: "monospace" }}>
                          <div style={{ fontWeight: 700, marginBottom: 4, fontFamily: "sans-serif" }}>API rows returned:</div>
                          <div>odometer: {d.odomRows} &nbsp; faults: {d.faultRows}</div>
                          <div>fuel: {d.fuelRows} &nbsp; gps: {d.gpsRows} &nbsp; engine: {d.engineRows}</div>
                          <div>locations: {d.locationRows}</div>
                        </div>
                      )}
                      {(r.matched || []).map((m) => (
                        <div key={m.unit} style={{ marginTop: 8, paddingTop: 8, borderTop: "1px solid #86efac", fontFamily: "monospace", fontSize: 11 }}>
                          <div style={{ fontWeight: 700, fontFamily: "sans-serif", marginBottom: 3 }}>Unit {m.unit} raw values:</div>
                          <div>odom: {m.odom ?? "null"}</div>
                          <div>fuel: {JSON.stringify(m.fuel)}</div>
                          <div>engine: {JSON.stringify(m.engine)}</div>
                          <div>gps: {JSON.stringify(m.gps)}</div>
                        </div>
                      ))}
                    </>;
                  })()}
                </div>
              </div>
            )}
            {samsaraResult?.error && (
              <div style={{ background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 10, padding: "12px 14px", marginBottom: 18, fontSize: 13, color: "#dc2626", fontWeight: 600 }}>
                ⚠ {samsaraResult.error}
              </div>
            )}

            <div style={{ display: "flex", gap: 8 }}>
              {!samsaraResult?.success && (
                <button
                  onClick={handleSamsaraSync}
                  disabled={samsaraRunning}
                  style={{
                    flex: 1, padding: "11px", borderRadius: 9, border: "none", fontSize: 14, fontWeight: 600,
                    cursor: samsaraRunning ? "wait" : "pointer",
                    background: samsaraRunning ? "#93c5fd" : "var(--color-primary)", color: "#fff",
                    display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
                  }}
                >
                  {samsaraRunning
                    ? <><span style={{ display: "inline-block", width: 14, height: 14, border: "2px solid #fff", borderTopColor: "transparent", borderRadius: "50%", animation: "spin .6s linear infinite" }} /> Syncing…</>
                    : "▶ Run Sync"
                  }
                </button>
              )}
              <button
                onClick={() => { setShowSamsara(false); setSamsaraResult(null); }}
                disabled={samsaraRunning}
                style={{ padding: "11px 18px", background: "var(--bg-raised)", color: "var(--text-muted)", border: "1px solid var(--border)", borderRadius: 9, fontSize: 13, cursor: samsaraRunning ? "not-allowed" : "pointer" }}
              >
                {samsaraResult?.success ? "Close" : "Cancel"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Drive Sync / Migration modal */}
      {showMigrate && (
        <div
          onClick={() => { if (!migrateRunning) { setShowMigrate(false); setMigrateResult(null); } }}
          style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,.55)", zIndex: 450, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{ background: "var(--bg-surface)", borderRadius: 16, width: "100%", maxWidth: 480, padding: 28, boxShadow: "0 20px 60px rgba(0,0,0,.28)" }}
          >
            <div style={{ fontSize: 17, fontWeight: 700, color: "var(--text-primary)", marginBottom: 6 }}>🗂 Drive Sync</div>
            <div style={{ fontSize: 13, color: "var(--text-muted)", marginBottom: 20, lineHeight: 1.6 }}>
              Moves all existing Google Drive files into the current folder structure:
              <ul style={{ margin: "8px 0 0 18px", padding: 0, lineHeight: 1.8 }}>
                <li><code>Truck Units / truck_unit_101 /</code> — truck files</li>
                <li><code>Truck Units / truck_unit_101 / Oil Change /</code> — oil receipts</li>
                <li><code>Drivers / John Doe /</code> — driver files</li>
              </ul>
              Files already in the correct folder are skipped. Firestore metadata is updated automatically.
            </div>

            {/* Result panel */}
            {migrateResult && !migrateResult.error && (
              <div style={{ background: "#f0fdf4", border: "1px solid #86efac", borderRadius: 10, padding: "14px 16px", marginBottom: 18 }}>
                <div style={{ fontWeight: 700, color: "#15803d", marginBottom: 8 }}>
                  ✅ Done — {migrateResult.totalMoved} file{migrateResult.totalMoved !== 1 ? "s" : ""} moved
                </div>
                {(() => {
                  const { trucks: t, drivers: d } = migrateResult.report || {};
                  return (
                    <div style={{ fontSize: 12, color: "#166534", lineHeight: 1.7 }}>
                      <div>🚛 Trucks: {t?.processed} processed, {t?.filesMoved} moved, {t?.skipped} skipped{t?.errors?.length ? `, ${t.errors.length} error(s)` : ""}</div>
                      <div>👤 Drivers: {d?.processed} processed, {d?.filesMoved} moved, {d?.skipped} skipped{d?.errors?.length ? `, ${d.errors.length} error(s)` : ""}</div>
                      {[...(t?.errors || []), ...(d?.errors || [])].map((e, i) => (
                        <div key={i} style={{ color: "#dc2626", marginTop: 4 }}>⚠ {e}</div>
                      ))}
                    </div>
                  );
                })()}
              </div>
            )}
            {migrateResult?.error && (
              <div style={{ background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 10, padding: "12px 14px", marginBottom: 18, fontSize: 13, color: "#dc2626", fontWeight: 600 }}>
                ⚠ {migrateResult.error}
              </div>
            )}

            <div style={{ display: "flex", gap: 8 }}>
              {!migrateResult?.success && (
                <button
                  onClick={handleRunMigration}
                  disabled={migrateRunning}
                  style={{
                    flex: 1, padding: "11px", borderRadius: 9, border: "none", fontSize: 14, fontWeight: 600, cursor: migrateRunning ? "wait" : "pointer",
                    background: migrateRunning ? "#93c5fd" : "var(--color-primary)", color: "#fff",
                    display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
                  }}
                >
                  {migrateRunning
                    ? <><span style={{ display: "inline-block", width: 14, height: 14, border: "2px solid #fff", borderTopColor: "transparent", borderRadius: "50%", animation: "spin .6s linear infinite" }} /> Running…</>
                    : "▶ Run Migration"
                  }
                </button>
              )}
              <button
                onClick={() => { setShowMigrate(false); setMigrateResult(null); }}
                disabled={migrateRunning}
                style={{
                  padding: "11px 18px", background: "var(--bg-raised)", color: "var(--text-muted)",
                  border: "1px solid var(--border)", borderRadius: 9, fontSize: 13, cursor: migrateRunning ? "not-allowed" : "pointer",
                }}
              >
                {migrateResult?.success ? "Close" : "Cancel"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add truck modal */}
      {showAdd && (
        <div
          style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,.5)", zIndex: 400, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}
          onClick={() => setShowAdd(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: "var(--bg-surface)", borderRadius: 16, width: "100%", maxWidth: 500,
              padding: 26, boxShadow: "0 20px 60px rgba(0,0,0,.25)", maxHeight: "90vh", overflowY: "auto",
            }}
          >
            <div style={{ fontSize: 17, fontWeight: 700, color: "var(--text-primary)", marginBottom: 18 }}>Add Truck</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <div>
                  <div style={labelStyle}>Unit # *</div>
                  <input
                    value={form.unitNumber}
                    onChange={(e) => setF("unitNumber", e.target.value)}
                    style={{ ...inputStyle, border: addError ? "1.5px solid #fca5a5" : "1px solid var(--border)" }}
                    placeholder="101"
                    autoFocus
                  />
                </div>
                <div>
                  <div style={labelStyle}>Year</div>
                  <input value={form.year} onChange={(e) => setF("year", e.target.value)} style={inputStyle} placeholder="2023" />
                </div>
                <div style={{ gridColumn: "1 / -1" }}>
                  <div style={labelStyle}>VIN</div>
                  <input value={form.vinNumber} onChange={(e) => setF("vinNumber", e.target.value)} style={inputStyle} placeholder="1FUJGLDR5CLBF7272" />
                </div>
                <div>
                  <div style={labelStyle}>Status</div>
                  <select value={form.status} onChange={(e) => setF("status", e.target.value)} style={{ ...inputStyle, cursor: "pointer" }}>
                    {TRUCK_STATUSES.map((s) => (
                      <option key={s.id} value={s.id} disabled={s.id === "active"}>
                        {s.label}{s.id === "active" ? " — assign driver first" : ""}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <div style={labelStyle}>Home Location</div>
                  <input value={form.homeLocation} onChange={(e) => setF("homeLocation", e.target.value)} style={inputStyle} placeholder="Cleveland OH" />
                </div>
                <div>
                  <div style={labelStyle}>Fuel Card</div>
                  <input value={form.fuelCard} onChange={(e) => setF("fuelCard", e.target.value)} style={inputStyle} placeholder="707649 99125 838298" />
                </div>
                <div>
                  <div style={labelStyle}>Last Oil Change (mi)</div>
                  <input type="number" value={form.lastOilChange} onChange={(e) => setF("lastOilChange", e.target.value)} style={inputStyle} placeholder="0" />
                </div>
                <div>
                  <div style={labelStyle}>Current Odometer (mi)</div>
                  <input type="number" value={form.currentOdometer} onChange={(e) => setF("currentOdometer", e.target.value)} style={inputStyle} placeholder="0" />
                </div>
              </div>

              {/* Insurance */}
              <div style={{ borderTop: "1px solid var(--border)", paddingTop: 12 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: ".06em", marginBottom: 10 }}>Insurance</div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                  <div>
                    <div style={labelStyle}>Auto Liability Company</div>
                    <input value={form.autoLiabilityCompany} onChange={(e) => setF("autoLiabilityCompany", e.target.value)} onBlur={(e) => setF("autoLiabilityStatus", e.target.value.trim() ? "active" : "none")} style={inputStyle} placeholder="e.g. Progressive" />
                  </div>
                  <div>
                    <div style={labelStyle}>Cargo Insurance Company</div>
                    <input value={form.cargoInsuranceCompany} onChange={(e) => setF("cargoInsuranceCompany", e.target.value)} onBlur={(e) => setF("cargoInsuranceStatus", e.target.value.trim() ? "active" : "none")} style={inputStyle} placeholder="e.g. State Farm" />
                  </div>
                </div>
              </div>
              {addError && (
                <div style={{ background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 8, padding: "9px 12px", fontSize: 13, color: "#dc2626", fontWeight: 600 }}>
                  ⚠ {addError}
                </div>
              )}
              <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
                <button
                  onClick={handleAdd}
                  disabled={!form.unitNumber.trim()}
                  style={{
                    flex: 1, padding: "11px", background: form.unitNumber.trim() ? "var(--color-primary)" : "var(--text-disabled)",
                    color: "#fff", border: "none", borderRadius: 9, fontSize: 14, fontWeight: 600, cursor: form.unitNumber.trim() ? "pointer" : "default",
                  }}
                >
                  Add Truck
                </button>
                <button
                  onClick={() => setShowAdd(false)}
                  style={{ padding: "11px 18px", background: "var(--bg-raised)", color: "var(--text-muted)", border: "1px solid var(--border)", borderRadius: 9, fontSize: 13, cursor: "pointer" }}
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
