import { useRef, useState } from "react";

/* ── CSV parser ─────────────────────────────────────────────────── */
function parseRows(text) {
  // strip BOM
  const clean = text.replace(/^\uFEFF/, "");
  const lines = clean.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) return [];

  const headers = lines[0].split("\t").map((h) => h.replace(/^"|"$/g, "").trim().toLowerCase());

  const idx = (keyword) => headers.findIndex((h) => h.includes(keyword));
  const nameIdx      = idx("full_name");
  const phoneIdx     = headers.findIndex((h) => h === "phone");
  const createdIdx   = idx("created_time");
  const platformIdx  = headers.findIndex((h) => h === "platform");
  const campaignIdx  = idx("campaign_name");

  // Facebook custom questions sit right after "platform" column:
  // platform+1 = Q1 (English level), platform+2 = Q2 (telegram), platform+3 = Q3 (logistics/note)
  const engIdx  = platformIdx >= 0 ? platformIdx + 1 : -1;
  const tgIdx   = platformIdx >= 0 ? platformIdx + 2 : -1;
  const noteIdx = platformIdx >= 0 ? platformIdx + 3 : -1;

  const results = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split("\t").map((c) => c.replace(/^"|"$/g, "").trim());
    if (cols.length < 3) continue;

    const name = nameIdx >= 0 ? cols[nameIdx] ?? "" : "";
    let phone  = phoneIdx >= 0 ? cols[phoneIdx] ?? "" : "";
    phone = phone.replace(/^p:\s*/i, "").trim();

    const engRaw   = engIdx    >= 0 && engIdx    < cols.length ? cols[engIdx]    : "";
    const telegram = tgIdx     >= 0 && tgIdx     < cols.length ? cols[tgIdx]     : "";
    const note     = noteIdx   >= 0 && noteIdx   < cols.length ? cols[noteIdx]   : "";
    const campaign = campaignIdx >= 0 && campaignIdx < cols.length ? cols[campaignIdx] : "";
    const createdAt = createdIdx >= 0 ? (cols[createdIdx] || "").split("T")[0] : "";

    // Try to extract English level from answer like "Орієнтовно б1", "Стабільний б2" etc.
    const engMatch = engRaw.match(/[AaBbCc][12]/);
    const englishLevel = engMatch ? engMatch[0].toUpperCase() : "";

    if (name || phone) {
      results.push({ name, phone, telegram, note, englishLevel, campaign, createdAt, stage: "new_lead", role: "" });
    }
  }
  return results;
}

async function readAsText(file, enc) {
  return new Promise((res) => {
    const r = new FileReader();
    r.onload = (e) => res(e.target.result || "");
    r.onerror = () => res("");
    r.readAsText(file, enc);
  });
}

/* ── Component ──────────────────────────────────────────────────── */
export default function ImportFBModal({ onClose, onImport, existingPhones = [] }) {
  const inputRef = useRef();
  const [leads, setLeads] = useState(null);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState(new Set());

  /* normalise phone for dedup */
  const norm = (p) => String(p || "").replace(/\D/g, "");
  const existNorm = existingPhones.map(norm);
  const isDup = (phone) => { const n = norm(phone); return n && existNorm.includes(n); };

  async function handleFile(file) {
    if (!file) return;
    setError("");
    let parsed = parseRows(await readAsText(file, "UTF-16"));
    if (!parsed.length) parsed = parseRows(await readAsText(file, "UTF-8"));
    if (!parsed.length) { setError("Could not parse file. Make sure it's a Facebook leads CSV."); return; }

    setLeads(parsed);
    // pre-select all non-duplicates
    const sel = new Set();
    parsed.forEach((l, i) => { if (!isDup(l.phone)) sel.add(i); });
    setSelected(sel);
  }

  function toggle(i) {
    setSelected((prev) => { const s = new Set(prev); s.has(i) ? s.delete(i) : s.add(i); return s; });
  }

  function toggleAll() {
    const eligible = leads.map((l, i) => ({ l, i })).filter(({ l }) => !isDup(l.phone));
    if (selected.size === eligible.length) setSelected(new Set());
    else setSelected(new Set(eligible.map(({ i }) => i)));
  }

  function doImport() {
    onImport(leads.filter((_, i) => selected.has(i)));
    onClose();
  }

  const eligibleCount = leads ? leads.filter((l) => !isDup(l.phone)).length : 0;

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.5)", zIndex: 500,
      display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
      <div style={{ background: "#fff", borderRadius: 16, width: "100%", maxWidth: 560,
        maxHeight: "88vh", display: "flex", flexDirection: "column",
        boxShadow: "0 20px 60px rgba(0,0,0,.22)" }}>

        {/* Header */}
        <div style={{ padding: "18px 24px", borderBottom: "1px solid #f1f5f9",
          display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ fontSize: 16, fontWeight: 700, color: "#0f172a" }}>📥 Import from Facebook</div>
          <button onClick={onClose} style={{ background: "#f8fafc", border: "1px solid #e2e8f0",
            borderRadius: 7, width: 30, height: 30, cursor: "pointer", color: "#64748b", fontSize: 16 }}>×</button>
        </div>

        {/* Body */}
        <div style={{ padding: "20px 24px", overflowY: "auto", flex: 1 }}>
          {!leads ? (
            /* Upload zone */
            <div>
              <div
                onClick={() => inputRef.current?.click()}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => { e.preventDefault(); handleFile(e.dataTransfer.files[0]); }}
                style={{ border: "2px dashed #bfdbfe", borderRadius: 14, padding: "44px 20px",
                  textAlign: "center", cursor: "pointer", background: "#f0f9ff",
                  transition: "border-color .15s" }}
              >
                <div style={{ fontSize: 36, marginBottom: 10 }}>📂</div>
                <div style={{ fontSize: 14, fontWeight: 700, color: "#1d4ed8", marginBottom: 4 }}>
                  Drop Facebook CSV here or click to select
                </div>
                <div style={{ fontSize: 12, color: "#64748b" }}>
                  Facebook Lead Ads export (.csv) · UTF-8 and UTF-16 supported
                </div>
              </div>
              <input ref={inputRef} type="file" accept=".csv,.tsv,text/csv"
                style={{ display: "none" }} onChange={(e) => handleFile(e.target.files[0])} />
              {error && <div style={{ marginTop: 12, color: "#dc2626", fontSize: 13 }}>{error}</div>}
            </div>
          ) : (
            /* Leads list */
            <div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                <div style={{ fontSize: 13, color: "#475569" }}>
                  Found <b>{leads.length}</b> leads ·{" "}
                  <b style={{ color: "#2563eb" }}>{selected.size}</b> selected
                  {leads.length - eligibleCount > 0 && (
                    <span style={{ color: "#dc2626" }}> · {leads.length - eligibleCount} duplicates</span>
                  )}
                </div>
                <button onClick={toggleAll}
                  style={{ fontSize: 12, color: "#2563eb", background: "none", border: "none", cursor: "pointer", fontWeight: 600 }}>
                  {selected.size === eligibleCount ? "Deselect all" : "Select all"}
                </button>
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
                {leads.map((lead, i) => {
                  const dup = isDup(lead.phone);
                  const sel = selected.has(i);
                  return (
                    <label key={i} style={{
                      display: "flex", alignItems: "flex-start", gap: 10, padding: "10px 13px",
                      background: dup ? "#fef2f2" : sel ? "#f0f9ff" : "#f8fafc",
                      border: `1px solid ${dup ? "#fecaca" : sel ? "#bae6fd" : "#e2e8f0"}`,
                      borderRadius: 9, cursor: dup ? "not-allowed" : "pointer", opacity: dup ? .65 : 1,
                    }}>
                      <input type="checkbox" checked={sel} disabled={dup}
                        onChange={() => !dup && toggle(i)} style={{ marginTop: 3, flexShrink: 0 }} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 13, fontWeight: 600, color: "#0f172a" }}>{lead.name || "—"}</div>
                        <div style={{ fontSize: 11, color: "#64748b", marginTop: 1 }}>
                          {lead.phone}
                          {lead.telegram ? ` · ✈ ${lead.telegram}` : ""}
                        </div>
                        {lead.note && (
                          <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 3, lineHeight: 1.4,
                            overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" }}>
                            {lead.note}
                          </div>
                        )}
                        {dup && <div style={{ fontSize: 10, color: "#dc2626", marginTop: 3, fontWeight: 600 }}>⚠ Already in system</div>}
                      </div>
                      {lead.createdAt && (
                        <div style={{ fontSize: 10, color: "#94a3b8", whiteSpace: "nowrap", paddingTop: 2 }}>
                          {lead.createdAt}
                        </div>
                      )}
                    </label>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        {leads && (
          <div style={{ padding: "14px 24px", borderTop: "1px solid #f1f5f9", display: "flex", gap: 8 }}>
            <button onClick={onClose}
              style={{ flex: 1, padding: "10px", background: "#f8fafc", border: "1px solid #e2e8f0",
                borderRadius: 8, fontSize: 13, cursor: "pointer", color: "#374151" }}>
              Cancel
            </button>
            <button onClick={doImport} disabled={selected.size === 0}
              style={{ flex: 2, padding: "10px", border: "none", borderRadius: 8, fontSize: 13,
                fontWeight: 700, cursor: selected.size > 0 ? "pointer" : "not-allowed",
                background: selected.size > 0 ? "#2563eb" : "#e2e8f0",
                color: selected.size > 0 ? "#fff" : "#94a3b8" }}>
              Import {selected.size} lead{selected.size !== 1 ? "s" : ""}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
