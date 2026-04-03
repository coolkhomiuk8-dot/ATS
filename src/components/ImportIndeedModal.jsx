import { useState, useRef } from "react";
import { STAGES } from "../constants/data";

// ── Normalize phone to 10 digits (strips +1 / 1 prefix) ──────────────────
function normalizePhone(raw = "") {
  const digits = String(raw).replace(/\D/g, "");
  if ((digits.startsWith("1") || digits.startsWith("38")) && digits.length === 11) return digits.slice(1);
  if (digits.length === 12 && digits.startsWith("38")) return digits.slice(2); // Ukrainian +380...
  return digits.slice(-10); // fallback: take last 10 digits
}

// ── CSV parser (handles quoted fields with commas inside) ──────────────────
function parseCSVRow(line) {
  const fields = [];
  let field = "";
  let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') {
      if (inQ && line[i + 1] === '"') { field += '"'; i++; }
      else inQ = !inQ;
    } else if (c === "," && !inQ) {
      fields.push(field.trim()); field = "";
    } else {
      field += c;
    }
  }
  fields.push(field.trim());
  return fields;
}

function parseCSV(text) {
  const lines = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n").filter(Boolean);
  return lines.map(parseCSVRow);
}

// ── Map Indeed availability answer → our AVAILABILITY_OPTIONS ─────────────
function mapAvailable(raw = "") {
  const r = raw.toLowerCase();
  if (r.includes("asap") || r.includes("immediately") || r.includes("right")) return "ASAP";
  if (r.includes("1-2 week") || r.includes("1 week") || r.includes("2 week")) return "In 1-2 weeks";
  if (r.includes("3") && r.includes("7")) return "In 3-7 days";
  if (r.includes("2") && r.includes("3")) return "In 2-3 Days";
  if (r.includes("month") || r.includes("more")) return "More than 2 weeks";
  return "TBD";
}

// ── Extract truck types from a free-text answer ────────────────────────────
const TRUCK_KEYWORDS = [
  ["Dry Van", ["dry van"]],
  ["Flatbed", ["flatbed", "flat bed"]],
  ["Reefer", ["reefer", "refriger"]],
  ["Tanker", ["tanker"]],
  ["Step Deck", ["step deck"]],
  ["Lowboy", ["lowboy"]],
  ["Car Hauler", ["car hauler", "car haul"]],
  ["Dump Truck", ["dump truck", "dump"]],
  ["Box Truck", ["box truck", "box"]],
  ["Cargo Van", ["cargo van", "cargo"]],
];

function extractTruckTypes(answer = "") {
  const lower = answer.toLowerCase();
  return TRUCK_KEYWORDS.filter(([, keys]) => keys.some((k) => lower.includes(k))).map(([label]) => label);
}

// ── Parse one Indeed CSV row into a driver-like object ────────────────────
function parseIndeedRow(headers, cols) {
  if (!cols || cols.length < 3) return null;

  const idx = (name) => headers.findIndex((h) => h.toLowerCase().includes(name.toLowerCase()));

  const get = (name) => {
    const i = idx(name);
    return i >= 0 ? (cols[i] || "").replace(/^'+/, "").trim() : "";
  };

  const name  = get("name");
  const email = get("email");
  const rawPhone = get("phone").replace(/^'+/, "");
  const digits = normalizePhone(rawPhone);
  const phone = digits.length === 10 ? `(${digits.slice(0,3)}) ${digits.slice(3,6)}-${digits.slice(6)}` : rawPhone.trim();
  const city   = get("candidate location");
  const date   = get("date") || null;

  // Qualifications — starts after "source" column
  const qualifications = [];
  for (let i = 0; i < 15; i++) {
    const qNameIdx = headers.findIndex((h) => h.toLowerCase() === `qualification ${i + 1}`);
    if (qNameIdx < 0) continue;
    const question = (cols[qNameIdx] || "").trim();
    const answer   = (cols[qNameIdx + 1] || "").trim();
    const match    = (cols[qNameIdx + 2] || "").trim();
    if (question && answer) qualifications.push({ question, answer, match });
  }

  // Try to auto-detect useful fields from qualifications
  let truckTypes = [];
  let available  = "TBD";
  let expYears   = 0;

  qualifications.forEach(({ question, answer }) => {
    const q = question.toLowerCase();
    if (q.includes("truck") && q.includes("type")) {
      truckTypes = extractTruckTypes(answer);
    }
    if (q.includes("ready") || q.includes("start") || q.includes("available")) {
      available = mapAvailable(answer);
    }
    if (q.includes("experience") || q.includes("how long")) {
      const nums = answer.match(/\d+/);
      if (nums) expYears = parseInt(nums[0], 10);
    }
  });

  if (!name) return null;

  return {
    name, email, phone, city,
    createdAt: date ? date.slice(0, 10) : null,
    source: "Indeed",
    stage: "new",
    interest: "Warm",
    truckTypes,
    available,
    exp: expYears,
    qualifications,
    notes: [],
    docs: {},
    flags: [],
    nextAction: null,
    nextActionTime: "10:00",
    files: [],
    startDate: available,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
const JOB_TYPES = ["Conestoga", "26 FT Box Truck", "Dry Van", "Flatbed", "Reefer", "Tanker", "Other"];

export default function ImportIndeedModal({ drivers = [], onImport, onClose }) {
  const [leads, setLeads]       = useState([]);
  const [selected, setSelected] = useState(new Set());
  const [importing, setImporting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError]       = useState("");
  const [jobType, setJobType]   = useState("");
  const inputRef = useRef();

  // ── Parse dropped / chosen file ──────────────────────────────────────────
  function handleFile(file) {
    setError("");
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const rows = parseCSV(e.target.result);
        if (rows.length < 2) { setError("File appears empty or unrecognised."); return; }
        const headers = rows[0].map((h) => h.trim());
        const parsed = rows.slice(1).map((row) => parseIndeedRow(headers, row)).filter(Boolean);
        const existingPhones = new Set(
          (drivers || []).map((d) => normalizePhone(d.phone || ""))
        );
        // also track phones seen within this CSV to catch intra-file duplicates
        const seenInFile = new Set();
        const enriched = parsed.map((lead) => {
          const norm = normalizePhone(lead.phone || "");
          const isDup = existingPhones.has(norm) || seenInFile.has(norm);
          if (norm) seenInFile.add(norm);
          return { ...lead, _dup: isDup };
        });
        setLeads(enriched);
        setSelected(new Set(enriched.filter((l) => !l._dup).map((_, i) => i)));
      } catch {
        setError("Failed to parse file. Make sure it's a valid Indeed CSV.");
      }
    };
    reader.readAsText(file, "utf-8");
  }

  function toggleAll() {
    if (selected.size === leads.filter((l) => !l._dup).length) setSelected(new Set());
    else setSelected(new Set(leads.map((_, i) => i).filter((i) => !leads[i]._dup)));
  }

  function toggle(i) {
    if (leads[i]._dup) return;
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(i) ? next.delete(i) : next.add(i);
      return next;
    });
  }

  async function handleImport() {
    const toImport = [...selected].map((i) => ({
      ...leads[i],
      ...(jobType ? { jobType } : {}),
    }));
    if (!toImport.length) return;
    setImporting(true);
    setProgress(0);
    const results = await onImport(toImport, (done) => setProgress(done));
    setImporting(false);
    if (results?.errors > 0) setError(`Imported with ${results.errors} error(s).`);
    else onClose();
  }

  const selCount = selected.size;

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,.55)", zIndex: 500, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}
      onClick={onClose}>
      <div style={{ background: "#fff", borderRadius: 16, width: "100%", maxWidth: 560, maxHeight: "88vh", display: "flex", flexDirection: "column", boxShadow: "0 24px 64px rgba(0,0,0,.22)" }}
        onClick={(e) => e.stopPropagation()}>

        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "18px 22px 14px", borderBottom: "1px solid #f1f5f9" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ fontSize: 22 }}>📋</span>
            <span style={{ fontSize: 16, fontWeight: 700, color: "#0f172a" }}>Import from Indeed</span>
          </div>
          <button onClick={onClose} style={{ background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 7, width: 30, height: 30, cursor: "pointer", color: "#64748b", fontSize: 14 }}>✕</button>
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: "auto", padding: "18px 22px" }}>

          {/* Job Type selector — always visible */}
          {!importing && (
            <div style={{ marginBottom: 14 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: ".06em", marginBottom: 8 }}>Job Type</div>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
                {JOB_TYPES.map((t) => (
                  <button
                    key={t}
                    onClick={() => setJobType(jobType === t ? "" : t)}
                    style={{
                      padding: "5px 12px", borderRadius: 20, fontSize: 12, fontWeight: 600, cursor: "pointer",
                      border: `1px solid ${jobType === t ? "#2563eb" : "#e2e8f0"}`,
                      background: jobType === t ? "#2563eb" : "#f8fafc",
                      color: jobType === t ? "#fff" : "#64748b",
                      transition: "all .15s",
                    }}
                  >
                    {t}
                  </button>
                ))}
                <input
                  placeholder="Custom…"
                  value={JOB_TYPES.includes(jobType) ? "" : jobType}
                  onChange={(e) => setJobType(e.target.value)}
                  style={{ padding: "5px 10px", borderRadius: 20, fontSize: 12, border: "1px solid #e2e8f0", outline: "none", width: 90, color: "#0f172a" }}
                />
              </div>
            </div>
          )}

          {/* Drop zone */}
          {leads.length === 0 && (
            <div
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => { e.preventDefault(); handleFile(e.dataTransfer.files[0]); }}
              onClick={() => inputRef.current?.click()}
              style={{ border: "2px dashed #cbd5e1", borderRadius: 12, padding: "40px 20px", textAlign: "center", cursor: "pointer", background: "#f8fafc" }}
            >
              <div style={{ fontSize: 36, marginBottom: 10 }}>📁</div>
              <div style={{ fontSize: 14, fontWeight: 600, color: "#0f172a", marginBottom: 4 }}>Drop Indeed CSV here or click to browse</div>
              <div style={{ fontSize: 12, color: "#94a3b8" }}>Export from Indeed → "Download" → CSV</div>
              <input ref={inputRef} type="file" accept=".csv,.txt" style={{ display: "none" }} onChange={(e) => handleFile(e.target.files[0])} />
            </div>
          )}

          {error && <div style={{ color: "#ef4444", fontSize: 13, marginTop: 10 }}>{error}</div>}

          {/* Importing progress */}
          {importing && (
            <div style={{ textAlign: "center", padding: "30px 0" }}>
              <div style={{ fontSize: 36, marginBottom: 12 }}>⏳</div>
              <div style={{ fontSize: 14, fontWeight: 600, color: "#0f172a", marginBottom: 6 }}>Importing leads…</div>
              <div style={{ fontSize: 13, color: "#64748b", marginBottom: 14 }}>{progress} / {selCount}</div>
              <div style={{ background: "#f1f5f9", borderRadius: 99, height: 8, overflow: "hidden" }}>
                <div style={{ height: "100%", width: `${selCount ? (progress / selCount) * 100 : 0}%`, background: "#2563eb", borderRadius: 99, transition: "width .3s" }} />
              </div>
            </div>
          )}

          {/* Lead list */}
          {!importing && leads.length > 0 && (
            <>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
                <span style={{ fontSize: 13, color: "#64748b" }}>
                  Found <b>{leads.length}</b> leads · <b>{selCount}</b> selected
                </span>
                <button onClick={toggleAll} style={{ fontSize: 12, color: "#2563eb", background: "none", border: "none", cursor: "pointer", fontWeight: 600 }}>
                  {selCount === leads.filter(l => !l._dup).length ? "Deselect all" : "Select all"}
                </button>
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
                {leads.map((lead, i) => (
                  <div
                    key={i}
                    onClick={() => toggle(i)}
                    style={{
                      display: "flex", alignItems: "flex-start", gap: 10,
                      padding: "11px 13px",
                      background: lead._dup ? "#f8fafc" : selected.has(i) ? "#eff6ff" : "#fff",
                      border: `1px solid ${lead._dup ? "#e2e8f0" : selected.has(i) ? "#bfdbfe" : "#e2e8f0"}`,
                      borderRadius: 10, cursor: lead._dup ? "default" : "pointer",
                      opacity: lead._dup ? 0.55 : 1,
                    }}
                  >
                    <div style={{
                      width: 17, height: 17, marginTop: 2, borderRadius: 4, flexShrink: 0,
                      border: `2px solid ${selected.has(i) ? "#2563eb" : "#d1d5db"}`,
                      background: selected.has(i) ? "#2563eb" : "transparent",
                      display: "flex", alignItems: "center", justifyContent: "center",
                    }}>
                      {selected.has(i) && <span style={{ color: "#fff", fontSize: 9, fontWeight: 700 }}>✓</span>}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 7, flexWrap: "wrap" }}>
                        <span style={{ fontSize: 13, fontWeight: 700, color: "#0f172a" }}>{lead.name}</span>
                        {lead._dup && <span style={{ fontSize: 10, background: "#fee2e2", color: "#dc2626", padding: "1px 6px", borderRadius: 4, fontWeight: 600 }}>Duplicate</span>}
                        {lead.truckTypes.length > 0 && lead.truckTypes.slice(0,2).map((t) => (
                          <span key={t} style={{ fontSize: 10, background: "#dbeafe", color: "#1d4ed8", padding: "1px 6px", borderRadius: 4 }}>{t}</span>
                        ))}
                        <span style={{ fontSize: 10, color: "#94a3b8", marginLeft: "auto" }}>{lead.createdAt || ""}</span>
                      </div>
                      <div style={{ fontSize: 12, color: "#64748b", marginTop: 2 }}>
                        {lead.phone} · {lead.city}
                      </div>
                      {lead.qualifications.length > 0 && (
                        <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 3 }}>
                          {lead.qualifications.length} qualification{lead.qualifications.length > 1 ? "s" : ""} included
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        {!importing && leads.length > 0 && (
          <div style={{ padding: "14px 22px", borderTop: "1px solid #f1f5f9", display: "flex", gap: 10 }}>
            <button
              onClick={handleImport}
              disabled={selCount === 0}
              style={{
                flex: 1, padding: "11px", borderRadius: 9, border: "none",
                background: selCount === 0 ? "#e2e8f0" : "#2563eb",
                color: selCount === 0 ? "#94a3b8" : "#fff",
                fontSize: 14, fontWeight: 600, cursor: selCount === 0 ? "default" : "pointer",
              }}
            >
              Import {selCount} lead{selCount !== 1 ? "s" : ""}
            </button>
            <button onClick={onClose} style={{ padding: "11px 18px", borderRadius: 9, border: "1px solid #e2e8f0", background: "#f8fafc", color: "#374151", fontSize: 13, cursor: "pointer" }}>
              Cancel
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
