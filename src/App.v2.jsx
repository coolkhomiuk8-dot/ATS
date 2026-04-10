import { useEffect, useMemo, useState } from "react";
import { onAuthStateChanged, signOut } from "firebase/auth";
import { doc, getDoc, serverTimestamp, setDoc } from "firebase/firestore";
import { STAGES } from "./constants/data";
import { nextActionTs, todayStr } from "./utils/date";
import { useDriversStore } from "./store/useDriversStore";
import { SPill } from "./components/UiBits";
import { useDriverAlerts } from "./hooks/useDriverAlerts";
import { useTheme } from "./hooks/useTheme";
import DriverAlertsPanel from "./components/DriverAlertsPanel";
import PipelineView from "./components/PipelineView";
import DashboardView from "./views/DashboardView";
import TemplatesView from "./views/TemplatesView";
import DispatchersView from "./views/DispatchersView";
import DriverDrawer from "./components/DriverDrawer";
import AddModal from "./components/AddModal";
import ImportIndeedModal from "./components/ImportIndeedModal";
import DuplicatesModal from "./components/DuplicatesModal";
import DailyReportModal from "./components/DailyReportModal";
import StageModal from "./components/StageModal";
import FirebaseAuthGate from "./components/FirebaseAuthGate";
import RoleManagerModal from "./components/RoleManagerModal";
import { auth, db, isFirebaseConfigured } from "./lib/firebase";
import { useDispatchersStore } from "./store/useDispatchersStore";

/* ── SVG ICONS ── */
function IconPipeline() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="5" height="18" rx="2"/>
      <rect x="10" y="3" width="5" height="12" rx="2"/>
      <rect x="17" y="3" width="4" height="7" rx="2"/>
    </svg>
  );
}

function IconDashboard() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="7" height="7" rx="1.5"/>
      <rect x="14" y="3" width="7" height="7" rx="1.5"/>
      <rect x="3" y="14" width="7" height="7" rx="1.5"/>
      <rect x="14" y="14" width="7" height="7" rx="1.5"/>
    </svg>
  );
}

function IconTeam() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
      <circle cx="9" cy="7" r="4"/>
      <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
      <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
    </svg>
  );
}

function IconTemplates() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
      <polyline points="14 2 14 8 20 8"/>
      <line x1="16" y1="13" x2="8" y2="13"/>
      <line x1="16" y1="17" x2="8" y2="17"/>
      <polyline points="10 9 9 9 8 9"/>
    </svg>
  );
}

function IconSearch() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="8"/>
      <line x1="21" y1="21" x2="16.65" y2="16.65"/>
    </svg>
  );
}

function IconClose() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="6" x2="6" y2="18"/>
      <line x1="6" y1="6" x2="18" y2="18"/>
    </svg>
  );
}

function IconLogout() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
      <polyline points="16 17 21 12 16 7"/>
      <line x1="21" y1="12" x2="9" y2="12"/>
    </svg>
  );
}

function IconChevronLeft() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="15 18 9 12 15 6"/>
    </svg>
  );
}

function IconChevronRight() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="9 18 15 12 9 6"/>
    </svg>
  );
}

function IconLink() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>
      <polyline points="15 3 21 3 21 9"/>
      <line x1="10" y1="14" x2="21" y2="3"/>
    </svg>
  );
}

function IconPlus() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <line x1="12" y1="5" x2="12" y2="19"/>
      <line x1="5" y1="12" x2="19" y2="12"/>
    </svg>
  );
}

function IconImport() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
      <polyline points="17 8 12 3 7 8"/>
      <line x1="12" y1="3" x2="12" y2="15"/>
    </svg>
  );
}

function IconTools() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/>
    </svg>
  );
}

/* ── STAT PILL v2 ── */
function StatPill({ n, l, color, glow }) {
  return (
    <div style={{
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      padding: "5px 12px",
      borderRadius: 9,
      background: "rgba(124, 58, 237, 0.08)",
      border: "1px solid rgba(124, 58, 237, 0.18)",
      minWidth: 52,
      gap: 1,
    }}>
      <span style={{ fontSize: 16, fontWeight: 700, color: color || "var(--color-accent)", lineHeight: 1, fontFamily: "Poppins, sans-serif" }}>{n}</span>
      <span style={{ fontSize: 9, fontWeight: 600, color: "var(--text-faint)", textTransform: "uppercase", letterSpacing: "0.05em" }}>{l}</span>
    </div>
  );
}

const NAV_ITEMS = [
  { id: "pipeline",    Icon: IconPipeline,  title: "Pipeline" },
  { id: "dispatchers", Icon: IconTeam,      title: "Team Hire" },
  { id: "dashboard",   Icon: IconDashboard, title: "Dashboard" },
  { id: "templates",   Icon: IconTemplates, title: "Templates" },
];

const QUICK_LINKS = [
  { title: "Send Offer",   url: "https://docs.google.com/document/d/1Rul2ihq6Pih4HnZVnYRAK03rDjUmmhciMRSGCmSNrOY/edit?tab=t.0" },
  { title: "Driver Docs",  url: "https://drive.google.com/drive/u/0/folders/1PyX6wwLcVwBQCZDqpUQb3sIN8ISerkRV" },
  { title: "W-9 Request",  url: "https://drive.google.com/file/d/1VViK6x1BxvRbMuIZhP5_H8y7iLlRMcWk/view?requestEsignature=true" },
  { title: "Medstop",      url: "https://employer.med-stop.com/dashboard" },
];

export default function App() {
  const { drivers, upd, addNote, addFile, removeFile, addDriver, deleteDriver, initDrivers, stopDriversSync, isLoading, syncError } = useDriversStore();
  const { subscribe: subDispatchers, unsubscribe: unsubDispatchers } = useDispatchersStore();
  const [firebaseUser, setFirebaseUser] = useState(() => auth?.currentUser || null);
  const [authLoading, setAuthLoading] = useState(isFirebaseConfigured);

  const [view, setView] = useState("pipeline");
  const [selectedId, setSelectedId] = useState(null);
  const [showAdd, setShowAdd] = useState(false);
  const [showIndeed, setShowIndeed] = useState(false);
  const [showDuplicates, setShowDuplicates] = useState(false);
  const [showDailyReport, setShowDailyReport] = useState(false);
  const [showToolsMenu, setShowToolsMenu] = useState(false);
  const [filterStage, setFilterStage] = useState("all");
  const [search, setSearch] = useState("");
  const [searchFocus, setSearchFocus] = useState(false);
  const [sidebarExpanded, setSidebarExpanded] = useState(false);
  const [copiedTpl, setCopiedTpl] = useState(null);
  const [stageModal, setStageModal] = useState(null);
  const [showRoleModal, setShowRoleModal] = useState(false);
  const [currentRole, setCurrentRole] = useState("user");
  const [roleLoading, setRoleLoading] = useState(true);

  const { theme, setTheme, THEMES } = useTheme();

  const canManageRoles = currentRole === "root";
  const canManageFiles = currentRole === "root" || currentRole === "admin";

  useEffect(() => {
    if (!isFirebaseConfigured || !auth) { setAuthLoading(false); return undefined; }
    const unsub = onAuthStateChanged(auth, (user) => { setFirebaseUser(user); setAuthLoading(false); });
    return () => unsub();
  }, []);

  useEffect(() => {
    if (!firebaseUser || !db) { setCurrentRole("user"); setRoleLoading(false); return; }
    let isMounted = true;
    async function loadRole() {
      setRoleLoading(true);
      try {
        const email = String(firebaseUser.email || "").trim().toLowerCase();
        if (!email) { if (isMounted) setCurrentRole("user"); return; }
        const roleSnap = await getDoc(doc(db, "user_roles", email));
        const role = roleSnap.exists() ? String(roleSnap.data()?.role || "user") : "user";
        if (isMounted) setCurrentRole(role);
      } catch { if (isMounted) setCurrentRole("user"); }
      finally { if (isMounted) setRoleLoading(false); }
    }
    loadRole();
    return () => { isMounted = false; };
  }, [firebaseUser]);

  useEffect(() => {
    if (isFirebaseConfigured && !firebaseUser) { stopDriversSync(); return undefined; }
    initDrivers(); subDispatchers();
    return () => { stopDriversSync(); unsubDispatchers(); };
  }, [firebaseUser, initDrivers, stopDriversSync, subDispatchers, unsubDispatchers]);

  const searchResults = useMemo(() => {
    if (!search.trim()) return [];
    const query = search.trim().toLowerCase();
    const digits = query.replace(/\D/g, "");
    return drivers.filter((driver) => {
      const name = String(driver.name || "").toLowerCase();
      const phone = String(driver.phone || "");
      const phoneDigits = phone.replace(/\D/g, "");
      return name.includes(query) || name.split(" ").some(p => p.startsWith(query)) ||
        phone.toLowerCase().includes(query) || (digits.length >= 3 && phoneDigits.includes(digits));
    }).slice(0, 8);
  }, [drivers, search]);

  const showDropdown = searchFocus && search.trim().length > 0;

  const filtered = useMemo(() => {
    const list = drivers.filter(d => filterStage === "all" || d.stage === filterStage);
    return [...list].sort((a, b) => nextActionTs(a) - nextActionTs(b));
  }, [drivers, filterStage]);

  const today = todayStr();
  const yesterdayDate = new Date();
  yesterdayDate.setDate(yesterdayDate.getDate() - 1);
  const yesterday = yesterdayDate.toISOString().split("T")[0];

  const addedToday    = drivers.filter(d => d.createdAt === today).length;
  const total         = drivers.filter(d => d.stage !== "trash").length;
  const finalStepStages = ["offer_accepted","drug_test_sched","drug_test","set_date","yard","hired"];
  const finalStep     = drivers.filter(d => finalStepStages.includes(d.stage)).length;

  const { activeAlerts, dismissAlert } = useDriverAlerts(drivers);

  function handleAlertReschedule(driverId, newDate, newTime) { upd(driverId, { nextAction: newDate, nextActionTime: newTime }); }
  function handleAlertDone(driverId, toStage) { requestStageChange(driverId, toStage); }

  function copyTpl(text, id) {
    navigator.clipboard.writeText(text).catch(() => {});
    setCopiedTpl(id);
    setTimeout(() => setCopiedTpl(null), 2000);
  }

  function requestStageChange(driverId, toStage) {
    const driver = drivers.find(d => d.id === driverId);
    if (!driver || driver.stage === toStage) return;
    setStageModal({ driverId, fromStage: driver.stage, toStage });
  }

  function confirmStageChange({ driverId, toStage, nextAction, nextActionTime, comment, trainedBy }) {
    const patch = { stage: toStage };
    if (nextAction) { patch.nextAction = nextAction; patch.nextActionTime = nextActionTime || "10:00"; }
    if (toStage === "hired" && trainedBy) { patch.trainedBy = trainedBy; } else { patch.trainedBy = null; }
    upd(driverId, patch);
    if (comment && comment.trim()) {
      const from = STAGES.find(s => s.id === stageModal?.fromStage)?.label || "";
      const to   = STAGES.find(s => s.id === toStage)?.label || "";
      addNote(driverId, `[Stage: ${from} -> ${to}]\n${comment.trim()}`);
    }
    setStageModal(null);
  }

  function handleAddFile(driverId, fileObj) { if (!canManageFiles) return; return addFile(driverId, fileObj); }
  function handleDeleteFile(driverId, fileIdx) { if (!canManageFiles) return; removeFile(driverId, fileIdx); }

  async function handleLogout() {
    if (!auth) return;
    try { await signOut(auth); setSelectedId(null); setShowAdd(false); setStageModal(null); } catch {}
  }

  async function handleAssignRole(emailInput, role) {
    if (!db || !firebaseUser) throw new Error("Firebase is not ready.");
    const normalizedEmail = String(emailInput || "").trim().toLowerCase();
    if (!normalizedEmail) throw new Error("Email is required.");
    if (!["user", "admin"].includes(role)) throw new Error("Role must be user or admin.");
    await setDoc(doc(db, "user_roles", normalizedEmail), {
      email: normalizedEmail, role,
      updatedBy: String(firebaseUser.email || "unknown"),
      updatedAt: serverTimestamp(),
    }, { merge: true });
  }

  const selected = selectedId ? drivers.find(d => d.id === selectedId) : null;

  if (isFirebaseConfigured && (authLoading || !firebaseUser)) return <FirebaseAuthGate />;

  const sideW = sidebarExpanded ? 216 : 60;

  return (
    <div style={{ display: "flex", height: "100vh", background: "var(--bg-app)", overflow: "hidden" }}>

      {/* ── SIDEBAR ── */}
      <aside style={{
        width: sideW,
        background: "var(--bg-surface)",
        borderRight: "1px solid var(--border)",
        display: "flex",
        flexDirection: "column",
        padding: "12px 0",
        gap: 2,
        flexShrink: 0,
        transition: "width .22s cubic-bezier(.4,0,.2,1)",
        overflow: "hidden",
        position: "relative",
        zIndex: 10,
      }}>

        {/* Logo */}
        <div style={{
          display: "flex",
          alignItems: "center",
          justifyContent: sidebarExpanded ? "space-between" : "center",
          padding: sidebarExpanded ? "0 12px" : "0",
          marginBottom: 16,
          gap: 8,
        }}>
          <div style={{
            width: 36,
            height: 36,
            borderRadius: 10,
            background: "linear-gradient(135deg, #7C3AED 0%, #A855F7 100%)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 11,
            fontFamily: "Poppins, sans-serif",
            fontWeight: 700,
            color: "#fff",
            flexShrink: 0,
            boxShadow: "0 4px 12px rgba(124,58,237,0.4)",
            letterSpacing: "0.02em",
          }}>
            ATS
          </div>

          {sidebarExpanded && (
            <span style={{ fontSize: 13, fontWeight: 700, fontFamily: "Poppins, sans-serif", color: "var(--text-primary)", letterSpacing: "-0.01em", whiteSpace: "nowrap" }}>
              Driver CRM
            </span>
          )}

          <button
            onClick={() => setSidebarExpanded(v => !v)}
            title={sidebarExpanded ? "Collapse" : "Expand"}
            style={{
              width: 24, height: 24,
              border: "1px solid var(--border)",
              borderRadius: 6,
              background: "var(--bg-raised)",
              cursor: "pointer",
              color: "var(--text-faint)",
              display: "flex", alignItems: "center", justifyContent: "center",
              flexShrink: 0,
              transition: "all .15s",
            }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = "var(--color-primary)"; e.currentTarget.style.color = "var(--color-accent)"; }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = "var(--border)"; e.currentTarget.style.color = "var(--text-faint)"; }}
          >
            {sidebarExpanded ? <IconChevronLeft /> : <IconChevronRight />}
          </button>
        </div>

        {/* Nav section label */}
        {sidebarExpanded && (
          <div style={{ fontSize: 9, fontWeight: 700, color: "var(--text-faint)", letterSpacing: ".1em", textTransform: "uppercase", padding: "0 16px", marginBottom: 4 }}>
            Navigation
          </div>
        )}

        {/* Nav items */}
        {NAV_ITEMS.map(({ id, Icon, title }) => {
          const isActive = view === id;
          return (
            <button
              key={id}
              className="nav-item"
              title={title}
              onClick={() => setView(id)}
              style={{
                width: sidebarExpanded ? "calc(100% - 16px)" : 40,
                height: 40,
                margin: sidebarExpanded ? "1px 8px" : "1px 10px",
                border: "none",
                borderRadius: 10,
                background: isActive
                  ? "linear-gradient(135deg, rgba(124,58,237,0.2) 0%, rgba(168,85,247,0.12) 100%)"
                  : "transparent",
                boxShadow: isActive ? "inset 0 0 0 1px rgba(124,58,237,0.3), 0 0 10px rgba(124,58,237,0.1)" : "none",
                color: isActive ? "var(--color-accent)" : "var(--text-faint)",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: sidebarExpanded ? "flex-start" : "center",
                gap: 10,
                padding: sidebarExpanded ? "0 12px" : "0",
                transition: "all .18s ease",
                whiteSpace: "nowrap",
              }}
            >
              <Icon />
              {sidebarExpanded && (
                <span style={{ fontSize: 13, fontWeight: isActive ? 600 : 500 }}>{title}</span>
              )}
              {isActive && sidebarExpanded && (
                <div style={{
                  marginLeft: "auto",
                  width: 6, height: 6,
                  borderRadius: "50%",
                  background: "var(--color-accent)",
                  boxShadow: "0 0 6px var(--color-accent)",
                }} />
              )}
            </button>
          );
        })}

        {/* Divider */}
        <div style={{ height: 1, background: "var(--border)", margin: "10px 12px" }} />

        {/* Quick links */}
        {sidebarExpanded && (
          <div style={{ fontSize: 9, fontWeight: 700, color: "var(--text-faint)", letterSpacing: ".1em", textTransform: "uppercase", padding: "0 16px", marginBottom: 4 }}>
            Quick Links
          </div>
        )}

        {QUICK_LINKS.map(link => (
          <a
            key={link.title}
            href={link.url}
            target="_blank"
            rel="noopener noreferrer"
            title={link.title}
            style={{
              width: sidebarExpanded ? "calc(100% - 16px)" : 40,
              height: 34,
              margin: sidebarExpanded ? "1px 8px" : "1px 10px",
              border: "1px solid var(--border)",
              borderRadius: 8,
              background: "var(--bg-raised)",
              color: "var(--text-faint)",
              fontSize: 11,
              fontWeight: 500,
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: sidebarExpanded ? "flex-start" : "center",
              gap: 8,
              padding: sidebarExpanded ? "0 12px" : "0",
              textDecoration: "none",
              transition: "all .15s",
              whiteSpace: "nowrap",
              flexShrink: 0,
            }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = "var(--border-strong)"; e.currentTarget.style.color = "var(--text-muted)"; }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = "var(--border)"; e.currentTarget.style.color = "var(--text-faint)"; }}
          >
            <IconLink />
            {sidebarExpanded && <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{link.title}</span>}
          </a>
        ))}

        {/* Stage navigator */}
        {sidebarExpanded && view === "pipeline" && (
          <div style={{ flex: 1, marginTop: 12, borderTop: "1px solid var(--border)", paddingTop: 10, overflow: "hidden", display: "flex", flexDirection: "column" }}>
            <div style={{ fontSize: 9, fontWeight: 700, color: "var(--text-faint)", letterSpacing: ".1em", textTransform: "uppercase", padding: "0 16px", marginBottom: 6 }}>
              Stages
            </div>
            <div style={{ overflowY: "auto", flex: 1 }}>
              {STAGES.map(stage => {
                const count = drivers.filter(d => d.stage === stage.id).length;
                return (
                  <button
                    key={stage.id}
                    onClick={() => {
                      const col = document.querySelector(`[data-stage-id="${stage.id}"]`);
                      if (col) {
                        col.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "start" });
                        col.classList.remove("stage-pulse");
                        void col.offsetWidth;
                        col.classList.add("stage-pulse");
                        setTimeout(() => col.classList.remove("stage-pulse"), 1500);
                      }
                    }}
                    style={{
                      width: "100%",
                      padding: "5px 16px",
                      border: "none",
                      background: "transparent",
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "center",
                      gap: 7,
                      textAlign: "left",
                      borderRadius: 0,
                      transition: "background .12s",
                    }}
                    onMouseEnter={e => e.currentTarget.style.background = "var(--bg-hover)"}
                    onMouseLeave={e => e.currentTarget.style.background = "transparent"}
                  >
                    <div style={{ width: 6, height: 6, borderRadius: "50%", background: stage.color, flexShrink: 0 }} />
                    <span style={{ fontSize: 11, color: "var(--text-muted)", flex: 1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{stage.label}</span>
                    {count > 0 && (
                      <span style={{ fontSize: 9, fontWeight: 700, color: "#fff", background: stage.color, borderRadius: 10, padding: "1px 5px", flexShrink: 0, opacity: 0.85 }}>
                        {count}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </aside>

      {/* ── MAIN AREA ── */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", minWidth: 0 }}>

        {/* ── HEADER ── */}
        <header style={{
          background: "rgba(14, 11, 32, 0.85)",
          backdropFilter: "blur(20px)",
          WebkitBackdropFilter: "blur(20px)",
          borderBottom: "1px solid var(--border)",
          padding: "0 18px",
          display: "flex",
          alignItems: "center",
          gap: 10,
          height: 58,
          flexShrink: 0,
          zIndex: 20,
        }}>

          {/* View title */}
          <div style={{ fontSize: 15, fontWeight: 700, fontFamily: "Poppins, sans-serif", color: "var(--text-primary)", letterSpacing: "-0.01em", flexShrink: 0, marginRight: 2 }}>
            {NAV_ITEMS.find(n => n.id === view)?.title ?? "Driver CRM"}
          </div>

          {/* Role badge */}
          <span className={`role-badge role-badge--${currentRole}`}>
            {roleLoading ? "…" : currentRole}
          </span>

          {/* Search */}
          <div style={{ position: "relative", flex: "0 0 280px" }}>
            <span style={{
              position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)",
              color: "var(--text-faint)", pointerEvents: "none",
              display: "flex", alignItems: "center",
            }}>
              <IconSearch />
            </span>
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              onFocus={() => setSearchFocus(true)}
              onBlur={() => setTimeout(() => setSearchFocus(false), 160)}
              placeholder="Search by name or phone"
              style={{
                width: "100%",
                padding: "7px 30px 7px 34px",
                fontSize: 13,
                background: "var(--bg-raised)",
                border: `1px solid ${showDropdown ? "var(--color-primary)" : "var(--border-strong)"}`,
                borderRadius: showDropdown ? "9px 9px 0 0" : "9px",
                color: "var(--text-primary)",
                outline: "none",
                transition: "border .15s",
                boxShadow: showDropdown ? "0 0 0 3px rgba(124,58,237,0.15)" : "none",
              }}
            />
            {search.trim() && (
              <button
                onClick={() => setSearch("")}
                style={{
                  position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)",
                  background: "none", border: "none", color: "var(--text-faint)",
                  cursor: "pointer", display: "flex", alignItems: "center", padding: 2,
                  borderRadius: 4, transition: "color .12s",
                }}
                onMouseEnter={e => e.currentTarget.style.color = "var(--text-muted)"}
                onMouseLeave={e => e.currentTarget.style.color = "var(--text-faint)"}
              >
                <IconClose />
              </button>
            )}

            {showDropdown && (
              <div style={{
                position: "absolute", top: "100%", left: 0, right: 0,
                background: "var(--bg-surface)",
                border: "1px solid var(--color-primary)",
                borderTop: "none",
                borderRadius: "0 0 10px 10px",
                boxShadow: "0 12px 32px rgba(0,0,0,0.5), 0 0 20px rgba(124,58,237,0.1)",
                zIndex: 300, overflow: "hidden",
              }}>
                {searchResults.length === 0 ? (
                  <div style={{ padding: "13px 14px", fontSize: 13, color: "var(--text-faint)", textAlign: "center" }}>
                    No drivers found
                  </div>
                ) : searchResults.map(driver => {
                  const stage = STAGES.find(s => s.id === driver.stage) || STAGES[0];
                  const query = search.trim();
                  const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
                  const highlighted = driver.name.replace(new RegExp(`(${escaped})`, "gi"), "|||$1|||");
                  return (
                    <div
                      key={driver.id}
                      onMouseDown={() => { setSelectedId(driver.id); setSearch(""); setSearchFocus(false); }}
                      onMouseEnter={e => e.currentTarget.style.background = "var(--bg-hover)"}
                      onMouseLeave={e => e.currentTarget.style.background = "transparent"}
                      style={{
                        display: "flex", alignItems: "center", justifyContent: "space-between",
                        padding: "10px 14px", cursor: "pointer",
                        borderBottom: "1px solid var(--border)", transition: "background .1s",
                      }}
                    >
                      <div>
                        <div style={{ fontSize: 14, fontWeight: 600, color: "var(--text-primary)" }}>
                          {highlighted.split("|||").map((part, i) =>
                            part.toLowerCase() === query.toLowerCase()
                              ? <mark key={i} style={{ background: "var(--color-today-bg)", color: "var(--color-today-text)", borderRadius: 2, padding: "0 1px" }}>{part}</mark>
                              : <span key={i}>{part}</span>
                          )}
                        </div>
                        <div style={{ fontSize: 11, color: "var(--text-faint)", marginTop: 1 }}>
                          {driver.phone} · {driver.city}
                        </div>
                      </div>
                      <span style={{
                        fontSize: 10, background: stage.light, color: stage.color,
                        borderRadius: 20, padding: "2px 8px", fontWeight: 600, whiteSpace: "nowrap",
                        opacity: 0.9,
                      }}>
                        {stage.label}
                      </span>
                    </div>
                  );
                })}
                <div style={{ padding: "6px 14px", fontSize: 11, color: "var(--text-faint)", background: "var(--bg-subtle)", borderTop: "1px solid var(--border)" }}>
                  {searchResults.length > 0 ? `${searchResults.length} result${searchResults.length !== 1 ? "s" : ""} · click to open` : ""}
                </div>
              </div>
            )}
          </div>

          {/* Stage filter */}
          <select
            value={filterStage}
            onChange={e => setFilterStage(e.target.value)}
            style={{
              padding: "7px 10px", fontSize: 12,
              background: "var(--bg-raised)", border: "1px solid var(--border-strong)",
              borderRadius: 8, color: "var(--text-muted)", outline: "none",
              cursor: "pointer", transition: "border .15s",
            }}
            onFocus={e => e.currentTarget.style.borderColor = "var(--color-primary)"}
            onBlur={e => e.currentTarget.style.borderColor = "var(--border-strong)"}
          >
            <option value="all">All stages</option>
            {STAGES.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
          </select>

          {/* Stats */}
          <div style={{ display: "flex", gap: 5, flexShrink: 0 }}>
            <StatPill n={addedToday} l="Today"  color="#A855F7" />
            <StatPill n={total}      l="Total"  color="#C084FC" />
            <StatPill n={finalStep}  l="Final"  color="#34D399" />
          </div>

          {/* Theme switcher */}
          <div style={{
            display: "flex", gap: 2,
            background: "var(--bg-raised)", border: "1px solid var(--border)",
            borderRadius: 8, padding: 2, flexShrink: 0,
          }}>
            {THEMES.map(t => {
              const icon = t === "normal" ? "☀" : t === "dark" ? "◗" : "◑";
              const isOn = theme === t;
              return (
                <button
                  key={t}
                  onClick={() => setTheme(t)}
                  title={t === "normal" ? "Light" : t === "hc" ? "High Contrast" : "Dark"}
                  style={{
                    width: 26, height: 26, borderRadius: 6, border: "none",
                    fontSize: 13, cursor: "pointer", lineHeight: 1,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    background: isOn ? "var(--color-primary)" : "transparent",
                    color: isOn ? "#fff" : "var(--text-faint)",
                    boxShadow: isOn ? "0 0 8px rgba(124,58,237,0.4)" : "none",
                    transition: "all .15s",
                  }}
                >
                  {icon}
                </button>
              );
            })}
          </div>

          {/* Right actions */}
          <div style={{ marginLeft: "auto", display: "flex", gap: 6, flexShrink: 0, alignItems: "center" }}>

            {/* Tools dropdown */}
            <div style={{ position: "relative" }}>
              <button
                onClick={() => setShowToolsMenu(v => !v)}
                onBlur={() => setTimeout(() => setShowToolsMenu(false), 150)}
                style={{
                  background: "var(--bg-raised)", border: "1px solid var(--border-strong)",
                  color: "var(--text-muted)", padding: "7px 11px", borderRadius: 8,
                  fontSize: 12, fontWeight: 600, cursor: "pointer",
                  display: "flex", alignItems: "center", gap: 5,
                  transition: "all .15s",
                }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = "var(--border-glass)"; e.currentTarget.style.color = "var(--text-secondary)"; }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = "var(--border-strong)"; e.currentTarget.style.color = "var(--text-muted)"; }}
              >
                <IconTools /> Tools
              </button>

              {showToolsMenu && (
                <div style={{
                  position: "absolute", top: "calc(100% + 6px)", right: 0,
                  background: "var(--bg-surface)", border: "1px solid var(--border-glass)",
                  borderRadius: 12, boxShadow: "var(--shadow-lg)", zIndex: 300,
                  minWidth: 180, overflow: "hidden",
                  backdropFilter: "blur(10px)",
                }}>
                  {[
                    { label: "Daily Report",   action: () => { setShowDailyReport(true); setShowToolsMenu(false); } },
                    { label: "Find Duplicates",action: () => { setShowDuplicates(true); setShowToolsMenu(false); } },
                    ...(currentRole === "root" || currentRole === "admin" ? [{
                      label: "Set all → Conestoga",
                      action: async () => {
                        setShowToolsMenu(false);
                        if (!window.confirm("Set jobType = 'Conestoga' for all drivers that don't have a job type yet?")) return;
                        const toUpdate = drivers.filter(d => !d.jobType);
                        for (const d of toUpdate) await upd(d.id, { jobType: "Conestoga" });
                        alert(`Done! ${toUpdate.length} drivers updated.`);
                      }
                    }] : []),
                  ].map(item => (
                    <button
                      key={item.label}
                      onClick={item.action}
                      style={{
                        width: "100%", padding: "10px 14px", border: "none",
                        background: "transparent", cursor: "pointer", textAlign: "left",
                        fontSize: 13, color: "var(--text-secondary)", display: "flex",
                        alignItems: "center", gap: 9, transition: "background .1s",
                      }}
                      onMouseEnter={e => e.currentTarget.style.background = "var(--bg-hover)"}
                      onMouseLeave={e => e.currentTarget.style.background = "transparent"}
                    >
                      {item.label}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Import */}
            <button
              onClick={() => setShowIndeed(true)}
              style={{
                background: "var(--color-primary-light)", border: "1px solid var(--color-primary-border)",
                color: "var(--color-accent)", padding: "7px 12px", borderRadius: 8,
                fontSize: 12, fontWeight: 600, cursor: "pointer",
                display: "flex", alignItems: "center", gap: 5, transition: "all .15s",
              }}
              onMouseEnter={e => { e.currentTarget.style.background = "rgba(124,58,237,0.2)"; }}
              onMouseLeave={e => { e.currentTarget.style.background = "var(--color-primary-light)"; }}
            >
              <IconImport /> Import
            </button>

            {/* Add Driver */}
            <button
              onClick={() => setShowAdd(true)}
              className="btn-p"
              style={{
                background: "linear-gradient(135deg, #7C3AED 0%, #6D28D9 100%)",
                border: "none", color: "#fff", padding: "7px 14px",
                borderRadius: 8, fontSize: 12, fontWeight: 600,
                cursor: "pointer", display: "flex", alignItems: "center", gap: 5,
                boxShadow: "0 4px 12px rgba(124,58,237,0.35)",
                transition: "all .15s",
              }}
            >
              <IconPlus /> Add Driver
            </button>

            {/* Logout */}
            {isFirebaseConfigured && auth && (
              <button
                onClick={handleLogout}
                className="btn-g"
                title="Logout"
                style={{
                  background: "var(--bg-raised)", border: "1px solid var(--border-strong)",
                  color: "var(--text-muted)", padding: "7px 9px", borderRadius: 8,
                  fontSize: 14, cursor: "pointer", flexShrink: 0,
                  display: "flex", alignItems: "center", transition: "all .15s",
                }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = "var(--color-danger-border)"; e.currentTarget.style.color = "var(--color-danger)"; }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = "var(--border-strong)"; e.currentTarget.style.color = "var(--text-muted)"; }}
              >
                <IconLogout />
              </button>
            )}

            {/* Roles */}
            {canManageRoles && (
              <button
                onClick={() => setShowRoleModal(true)}
                className="btn-g"
                style={{
                  background: "var(--bg-raised)", border: "1px solid var(--border-strong)",
                  color: "var(--text-muted)", padding: "7px 11px", borderRadius: 8,
                  fontSize: 11, fontWeight: 600, cursor: "pointer", flexShrink: 0,
                  transition: "all .15s",
                }}
              >
                Roles
              </button>
            )}
          </div>
        </header>

        {/* Sync banners */}
        {isLoading && (
          <div style={{
            padding: "7px 18px",
            borderBottom: "1px solid var(--color-primary-border)",
            background: "linear-gradient(90deg, rgba(124,58,237,0.08), rgba(168,85,247,0.05))",
            color: "var(--color-accent)", fontSize: 12, fontWeight: 600,
            display: "flex", alignItems: "center", gap: 8,
          }}>
            <span style={{ display: "inline-block", width: 6, height: 6, borderRadius: "50%", background: "var(--color-accent)", animation: "glowPulse 1.2s ease-in-out infinite" }} />
            Syncing drivers from Firebase…
          </div>
        )}

        {!isLoading && syncError && (
          <div style={{
            padding: "7px 18px", borderBottom: "1px solid var(--color-danger-border)",
            background: "var(--color-danger-bg)", color: "var(--color-danger-text)", fontSize: 12,
          }}>
            {syncError}
          </div>
        )}

        {/* Main content */}
        <div style={{ flex: 1, overflow: "hidden", display: "flex" }}>
          {view === "pipeline"    && <PipelineView stages={STAGES} filteredDrivers={filtered} onSelectDriver={setSelectedId} onDropDriverToStage={requestStageChange} />}
          {view === "dispatchers" && <DispatchersView />}
          {view === "dashboard"   && <DashboardView drivers={drivers} />}
          {view === "templates"   && <TemplatesView copiedTpl={copiedTpl} onCopy={copyTpl} />}
        </div>
      </div>

      {/* ── OVERLAYS (same as before) ── */}
      {selected && (
        <DriverDrawer driver={selected} onClose={() => setSelectedId(null)} onUpd={upd} onNote={addNote}
          onFile={handleAddFile} onDeleteFile={handleDeleteFile} canManageFiles={canManageFiles}
          onStageChange={requestStageChange} onDelete={(id) => { deleteDriver(id); setSelectedId(null); }} />
      )}

      {showAdd && (
        <AddModal drivers={drivers} onClose={() => setShowAdd(false)}
          onAdd={(data) => { addDriver(data); setShowAdd(false); }} />
      )}

      {showIndeed && (
        <ImportIndeedModal drivers={drivers} onClose={() => setShowIndeed(false)}
          onImport={async (leads, onProgress) => {
            let done = 0, errors = 0;
            for (const lead of leads) { try { await addDriver(lead); } catch { errors++; } done++; onProgress(done); }
            return { errors };
          }} />
      )}

      {showDailyReport && (
        <DailyReportModal drivers={drivers} currentUser={firebaseUser?.email || ""} onClose={() => setShowDailyReport(false)} />
      )}

      {showDuplicates && (
        <DuplicatesModal drivers={drivers} onDelete={deleteDriver} onClose={() => setShowDuplicates(false)} />
      )}

      {stageModal && (
        <StageModal modal={stageModal} onConfirm={confirmStageChange} onCancel={() => setStageModal(null)} />
      )}

      {showRoleModal && canManageRoles && (
        <RoleManagerModal onClose={() => setShowRoleModal(false)} onAssignRole={handleAssignRole} />
      )}

      <DriverAlertsPanel alerts={activeAlerts} onReschedule={handleAlertReschedule} onDone={handleAlertDone} onDismiss={dismissAlert} />
    </div>
  );
}
