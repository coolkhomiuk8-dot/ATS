import { useMemo, useState } from "react";
import { todayStr } from "../utils/date";

// ─── helpers ────────────────────────────────────────────────────────────────
function count(drivers, pred) { return drivers.filter(pred).length; }
function today() { return todayStr(); }

// Sections label style
function SectionTitle({ n, children }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10, marginTop: 18 }}>
      <div style={{ width: 22, height: 22, borderRadius: 6, background: "#1e3a5f", color: "#fff", fontSize: 11, fontWeight: 800, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>{n}</div>
      <span style={{ fontSize: 13, fontWeight: 700, color: "#0f172a", letterSpacing: ".01em" }}>{children}</span>
    </div>
  );
}

// Read-only auto row
function AutoRow({ label, value }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "5px 10px", borderRadius: 6, background: "#f8fafc", marginBottom: 3 }}>
      <span style={{ fontSize: 12, color: "#475569" }}>{label}</span>
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <span style={{ fontSize: 10, background: "#dbeafe", color: "#1d4ed8", borderRadius: 4, padding: "1px 5px", fontWeight: 600 }}>AUTO</span>
        <span style={{ fontSize: 13, fontWeight: 700, color: "#0f172a", minWidth: 24, textAlign: "right" }}>{value}</span>
      </div>
    </div>
  );
}

// Manual number input row
function NumRow({ label, value, onChange }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "4px 10px", borderRadius: 6, background: "#fafafa", border: "1px solid #f1f5f9", marginBottom: 3 }}>
      <span style={{ fontSize: 12, color: "#475569" }}>{label}</span>
      <input
        type="number" min={0} value={value}
        onChange={e => onChange(Number(e.target.value))}
        style={{ width: 56, padding: "3px 7px", fontSize: 13, fontWeight: 700, textAlign: "right", border: "1px solid #e2e8f0", borderRadius: 6, background: "#fff", color: "#0f172a", outline: "none" }}
      />
    </div>
  );
}

// Textarea row
function TextRow({ label, value, onChange, rows = 2 }) {
  return (
    <div style={{ marginBottom: 6 }}>
      <div style={{ fontSize: 12, color: "#475569", marginBottom: 3 }}>{label}</div>
      <textarea
        rows={rows} value={value} onChange={e => onChange(e.target.value)}
        style={{ width: "100%", padding: "6px 10px", fontSize: 12, border: "1px solid #e2e8f0", borderRadius: 8, background: "#fff", color: "#0f172a", resize: "vertical", outline: "none", boxSizing: "border-box", fontFamily: "inherit" }}
        placeholder="Enter text…"
      />
    </div>
  );
}

// ─── Main component ──────────────────────────────────────────────────────────
export default function DailyReportModal({ drivers = [], currentUser = "", onClose }) {
  const td = today();

  // ── Auto stats ──────────────────────────────────────────────────────────
  const auto = useMemo(() => {
    // Drivers added today
    const todayDrivers = drivers.filter(d => d.createdAt === td);

    // Helper: how many drivers had a stage-entry TODAY for given stage(s)
    // Uses stageHistory array: [{stage, date, ts}]
    function movedToday(stages) {
      const stageSet = new Set(Array.isArray(stages) ? stages : [stages]);
      return drivers.filter(d =>
        (d.stageHistory || []).some(e => e.date === td && stageSet.has(e.stage))
      ).length;
    }

    return {
      // 2. New Leads Today — by createdAt date
      newTotal:      todayDrivers.length,
      newIndeed:     count(todayDrivers, d => d.source === "Indeed"),
      newCraigslist: count(todayDrivers, d => (d.source || "").toLowerCase().includes("craig")),
      newOther:      count(todayDrivers, d => !d.source?.match(/indeed|craig/i)),

      // 3. Lead Processing — who was moved into these stages TODAY
      contacted:    movedToday(["call1","call2","call3","video_sent","ppw","beenverified","videocall","offer_sent"]),
      noResponse:   movedToday(["call1","call2","call3"]),
      rejectedImm:  movedToday("trash"),

      // 4. Offers — moved TODAY
      offerSent:    movedToday("offer_sent"),
      offerAccepted:movedToday("offer_accepted"),

      // 5. Qualified — moved to beenverified TODAY
      bgMvrPassed:  movedToday("beenverified"),

      // 6. Drug Test — moved TODAY
      drugSched:    movedToday("drug_test_sched"),
      drugWaiting:  movedToday("drug_test"),

      // 7. Documents — moved to ppw TODAY
      docsWaiting:  movedToday("ppw"),

      // 8. Start Status — moved TODAY
      hiredToday:   movedToday("hired"),
      setDate:      movedToday("set_date"),
      atYard:       movedToday("yard"),
    };
  }, [drivers, td]);

  // ── Manual fields ────────────────────────────────────────────────────────
  const [hr, setHr] = useState(currentUser || "");

  // Section 1 — Fleet
  const [vacantTrucks,   setVacantTrucks]   = useState(0);
  const [inOnboarding,   setInOnboarding]   = useState(0);
  const [waitingStart,   setWaitingStart]   = useState(0);
  const [readyTomorrow,  setReadyTomorrow]  = useState(0);

  // Section 4 — Offers (partial manual)
  const [offerDeclined, setOfferDeclined] = useState(0);
  const [offerThinking, setOfferThinking] = useState(0);

  // Section 5 — Qualified
  const [notQualified,      setNotQualified]      = useState(0);
  const [rejAfterDetails,   setRejAfterDetails]   = useState(0);

  // Section 6 — Drug test
  const [drugRejected, setDrugRejected] = useState(0);

  // Section 7 — Docs
  const [docsReceived, setDocsReceived] = useState(0);
  const [docsIssues,   setDocsIssues]   = useState(0);

  // Section 8 — Start
  const [noShow, setNoShow] = useState(0);

  // Section 9 — Reasons for decline
  const [decLowPay,    setDecLowPay]    = useState(0);
  const [decHomeTime,  setDecHomeTime]  = useState(0);
  const [decWorkType,  setDecWorkType]  = useState(0);
  const [decBetter,    setDecBetter]    = useState(0);
  const [decMind,      setDecMind]      = useState(0);
  const [decOther,     setDecOther]     = useState("");

  // Section 10 — Problems
  const [prob1, setProb1] = useState("");
  const [prob2, setProb2] = useState("");
  const [prob3, setProb3] = useState("");

  // Section 11 — Plan tomorrow
  const [plan1, setPlan1] = useState("");
  const [plan2, setPlan2] = useState("");
  const [plan3, setPlan3] = useState("");

  // KPI
  const [kpiCalls,      setKpiCalls]      = useState(0);
  const [kpiInterviews, setKpiInterviews] = useState(0);
  const [kpiQualified,  setKpiQualified]  = useState(0);

  const [copied, setCopied] = useState(false);

  // ── Generate report text ────────────────────────────────────────────────
  function buildText() {
    const line = (label, val) => `  • ${label}: ${val ?? 0}`;
    return `
Daily Driver Recruitment Report
================================
Date: ${td}
HR:   ${hr || "—"}

1. Fleet Status
${line("Vacant trucks", vacantTrucks)}
${line("Drivers in onboarding", inOnboarding)}
${line("Waiting to start", waitingStart)}
${line("Can go on the road tomorrow", readyTomorrow)}

2. New Leads Today
${line("Total new candidates", auto.newTotal)}
${line("Indeed", auto.newIndeed)}
${line("Craigslist", auto.newCraigslist)}
${line("Other", auto.newOther)}

3. Lead Processing (pipeline snapshot)
${line("Contacted (active in pipeline)", auto.contacted)}
${line("No response (call stages)", auto.noResponse)}
${line("Rejected / Trash", auto.rejectedImm)}

4. Offers
${line("Offers made (sent)", auto.offerSent)}
${line("Accepted", auto.offerAccepted)}
${line("Declined", offerDeclined)}
${line("Thinking", offerThinking)}

5. Qualified Candidates
${line("Passed BG and MVR screening", auto.bgMvrPassed)}
${line("Not qualified", notQualified)}
${line("Rejected after job details", rejAfterDetails)}

6. Drug Test
${line("Scheduled", auto.drugSched)}
${line("Waiting for Results", auto.drugWaiting)}
${line("Rejected", drugRejected)}

7. Documents
${line("Documents received", docsReceived)}
${line("Waiting for documents", auto.docsWaiting)}
${line("Issues with documents", docsIssues)}

8. Start Status
${line("Started / Hired", auto.hiredToday)}
${line("Scheduled for arrival (set date)", auto.setDate)}
${line("At the yard", auto.atYard)}
${line("Did not show up", noShow)}

9. Reasons for Decline
${line("Low pay", decLowPay)}
${line("Home time", decHomeTime)}
${line("Type of work", decWorkType)}
${line("Better offer elsewhere", decBetter)}
${line("Changed mind", decMind)}
${line("Other", decOther || "—")}

10. Problems / Blockers Today
${[prob1, prob2, prob3].filter(Boolean).map(p => `  • ${p}`).join("\n") || "  • —"}

11. Plan for Tomorrow
${[plan1, plan2, plan3].filter(Boolean).map(p => `  • ${p}`).join("\n") || "  • —"}

KPI of the Day
${line("Number of calls", kpiCalls)}
${line("Number of interviews", kpiInterviews)}
${line("New qualified candidates", kpiQualified)}
`.trim();
  }

  function handleCopy() {
    navigator.clipboard.writeText(buildText()).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  }

  // ── Render ───────────────────────────────────────────────────────────────
  return (
    <div
      style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,.6)", zIndex: 500, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}
      onClick={onClose}
    >
      <div
        style={{ background: "#fff", borderRadius: 16, width: "100%", maxWidth: 680, maxHeight: "92vh", display: "flex", flexDirection: "column", boxShadow: "0 28px 72px rgba(0,0,0,.24)" }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 20px 12px", borderBottom: "1px solid #f1f5f9", flexShrink: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ fontSize: 24 }}>📊</span>
            <div>
              <div style={{ fontSize: 16, fontWeight: 700, color: "#0f172a" }}>Daily Recruitment Report</div>
              <div style={{ fontSize: 11, color: "#64748b" }}>{td} · <span style={{ color: "#2563eb" }}>AUTO</span> = from CRM · white = manual</div>
            </div>
          </div>
          <button onClick={onClose} style={{ background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 7, width: 30, height: 30, cursor: "pointer", color: "#64748b", fontSize: 14 }}>✕</button>
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: "auto", padding: "4px 20px 16px" }}>

          {/* HR name */}
          <div style={{ marginTop: 14, marginBottom: 4 }}>
            <div style={{ fontSize: 12, color: "#475569", marginBottom: 4, fontWeight: 600 }}>HR Name</div>
            <input value={hr} onChange={e => setHr(e.target.value)} placeholder="Enter your name…"
              style={{ width: "100%", padding: "7px 12px", fontSize: 13, border: "1px solid #e2e8f0", borderRadius: 8, background: "#fff", color: "#0f172a", outline: "none", boxSizing: "border-box" }} />
          </div>

          {/* 1. Fleet */}
          <SectionTitle n="1">Fleet Status</SectionTitle>
          <NumRow label="Vacant trucks"             value={vacantTrucks}  onChange={setVacantTrucks} />
          <NumRow label="Drivers in onboarding"     value={inOnboarding}  onChange={setInOnboarding} />
          <NumRow label="Waiting to start"          value={waitingStart}  onChange={setWaitingStart} />
          <NumRow label="Can go on the road tomorrow" value={readyTomorrow} onChange={setReadyTomorrow} />

          {/* 2. New Leads */}
          <SectionTitle n="2">New Leads Today</SectionTitle>
          <AutoRow label="Total new candidates" value={auto.newTotal} />
          <AutoRow label="Indeed"               value={auto.newIndeed} />
          <AutoRow label="Craigslist"           value={auto.newCraigslist} />
          <AutoRow label="Other"                value={auto.newOther} />

          {/* 3. Lead Processing */}
          <SectionTitle n="3">Lead Processing (pipeline snapshot)</SectionTitle>
          <AutoRow label="Contacted (active in pipeline)" value={auto.contacted} />
          <AutoRow label="No response (in call stages)"   value={auto.noResponse} />
          <AutoRow label="Rejected / Trash"               value={auto.rejectedImm} />

          {/* 4. Offers */}
          <SectionTitle n="4">Offers</SectionTitle>
          <AutoRow label="Offers sent"   value={auto.offerSent} />
          <AutoRow label="Accepted"      value={auto.offerAccepted} />
          <NumRow  label="Declined"      value={offerDeclined} onChange={setOfferDeclined} />
          <NumRow  label="Thinking"      value={offerThinking} onChange={setOfferThinking} />

          {/* 5. Qualified */}
          <SectionTitle n="5">Qualified Candidates</SectionTitle>
          <AutoRow label="Passed BG and MVR screening" value={auto.bgMvrPassed} />
          <NumRow  label="Not qualified"               value={notQualified}    onChange={setNotQualified} />
          <NumRow  label="Rejected after job details"  value={rejAfterDetails} onChange={setRejAfterDetails} />

          {/* 6. Drug Test */}
          <SectionTitle n="6">Drug Test</SectionTitle>
          <AutoRow label="Scheduled"         value={auto.drugSched} />
          <AutoRow label="Waiting for Results" value={auto.drugWaiting} />
          <NumRow  label="Rejected"          value={drugRejected} onChange={setDrugRejected} />

          {/* 7. Documents */}
          <SectionTitle n="7">Documents</SectionTitle>
          <NumRow  label="Documents received"    value={docsReceived} onChange={setDocsReceived} />
          <AutoRow label="Waiting for documents" value={auto.docsWaiting} />
          <NumRow  label="Issues with documents" value={docsIssues}   onChange={setDocsIssues} />

          {/* 8. Start Status */}
          <SectionTitle n="8">Start Status</SectionTitle>
          <AutoRow label="Started / Hired"              value={auto.hiredToday} />
          <AutoRow label="Scheduled for arrival (set date)" value={auto.setDate} />
          <AutoRow label="At the yard"                  value={auto.atYard} />
          <NumRow  label="Did not show up"              value={noShow} onChange={setNoShow} />

          {/* 9. Reasons for Decline */}
          <SectionTitle n="9">Reasons for Decline</SectionTitle>
          <NumRow label="Low pay"              value={decLowPay}   onChange={setDecLowPay} />
          <NumRow label="Home time"            value={decHomeTime} onChange={setDecHomeTime} />
          <NumRow label="Type of work"         value={decWorkType} onChange={setDecWorkType} />
          <NumRow label="Better offer elsewhere" value={decBetter} onChange={setDecBetter} />
          <NumRow label="Changed mind"         value={decMind}     onChange={setDecMind} />
          <TextRow label="Other (describe)"   value={decOther}    onChange={setDecOther} rows={2} />

          {/* 10. Problems */}
          <SectionTitle n="10">Problems / Blockers Today</SectionTitle>
          <TextRow label="Problem 1" value={prob1} onChange={setProb1} rows={2} />
          <TextRow label="Problem 2" value={prob2} onChange={setProb2} rows={2} />
          <TextRow label="Problem 3" value={prob3} onChange={setProb3} rows={2} />

          {/* 11. Plan tomorrow */}
          <SectionTitle n="11">Plan for Tomorrow</SectionTitle>
          <TextRow label="Point 1" value={plan1} onChange={setPlan1} rows={2} />
          <TextRow label="Point 2" value={plan2} onChange={setPlan2} rows={2} />
          <TextRow label="Point 3" value={plan3} onChange={setPlan3} rows={2} />

          {/* KPI */}
          <SectionTitle n="★">KPI of the Day</SectionTitle>
          <NumRow label="Number of calls"            value={kpiCalls}      onChange={setKpiCalls} />
          <NumRow label="Number of interviews"       value={kpiInterviews} onChange={setKpiInterviews} />
          <NumRow label="New qualified candidates"   value={kpiQualified}  onChange={setKpiQualified} />

        </div>

        {/* Footer */}
        <div style={{ padding: "12px 20px", borderTop: "1px solid #f1f5f9", display: "flex", gap: 10, justifyContent: "flex-end", flexShrink: 0, background: "#fafafa", borderRadius: "0 0 16px 16px" }}>
          <button onClick={onClose}
            style={{ padding: "9px 18px", borderRadius: 9, border: "1px solid #e2e8f0", background: "#fff", color: "#374151", fontSize: 13, cursor: "pointer" }}>
            Close
          </button>
          <button onClick={handleCopy}
            style={{ padding: "9px 22px", borderRadius: 9, border: "none", background: copied ? "#22c55e" : "#2563eb", color: "#fff", fontSize: 13, fontWeight: 700, cursor: "pointer", transition: "background .2s", display: "flex", alignItems: "center", gap: 6 }}>
            {copied ? "✓ Copied!" : "📋 Copy Report"}
          </button>
        </div>
      </div>
    </div>
  );
}
