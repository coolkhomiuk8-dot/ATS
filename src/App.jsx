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
import TrucksView from "./views/TrucksView";
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
import { useTrucksStore } from "./store/useTrucksStore";

export default function App() {
  const { drivers, upd, addNote, addFile, removeFile, addDriver, deleteDriver, initDrivers, stopDriversSync, isLoading, syncError } = useDriversStore();
  const { subscribe: subDispatchers, unsubscribe: unsubDispatchers } = useDispatchersStore();
  const { subscribeTrucks, unsubscribeTrucks } = useTrucksStore();
  const [firebaseUser, setFirebaseUser] = useState(() => auth?.currentUser || null);
  const [authLoading, setAuthLoading] = useState(isFirebaseConfigured);

  const VALID_VIEWS = ["pipeline", "dispatchers", "fleet", "dashboard", "templates"];
  function getInitialView() {
    const hash = window.location.hash.replace("#", "");
    return VALID_VIEWS.includes(hash) ? hash : "pipeline";
  }
  const [view, setViewRaw] = useState(getInitialView);
  function setView(v) {
    setViewRaw(v);
    window.location.hash = v;
  }
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
  const [alertsPanelOpen, setAlertsPanelOpen] = useState(false);
  const [currentRole, setCurrentRole] = useState("user");
  const [roleLoading, setRoleLoading] = useState(true);

  const { theme, setTheme, THEMES, LABELS } = useTheme();

  const canManageRoles = currentRole === "root";
  const canManageFiles = currentRole === "root" || currentRole === "admin";

  useEffect(() => {
    function onHashChange() {
      const hash = window.location.hash.replace("#", "");
      if (VALID_VIEWS.includes(hash)) setViewRaw(hash);
    }
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);

  useEffect(() => {
    if (!isFirebaseConfigured || !auth) {
      setAuthLoading(false);
      return undefined;
    }

    const unsub = onAuthStateChanged(auth, (user) => {
      setFirebaseUser(user);
      setAuthLoading(false);
    });

    return () => unsub();
  }, []);

  useEffect(() => {
    if (!firebaseUser || !db) {
      setCurrentRole("user");
      setRoleLoading(false);
      return;
    }

    let isMounted = true;

    async function loadRole() {
      setRoleLoading(true);

      try {
        const email = String(firebaseUser.email || "").trim().toLowerCase();
        if (!email) {
          if (isMounted) setCurrentRole("user");
          return;
        }

        const roleSnap = await getDoc(doc(db, "user_roles", email));
        const role = roleSnap.exists() ? String(roleSnap.data()?.role || "user") : "user";
        if (isMounted) setCurrentRole(role);
      } catch {
        if (isMounted) setCurrentRole("user");
      } finally {
        if (isMounted) setRoleLoading(false);
      }
    }

    loadRole();

    return () => {
      isMounted = false;
    };
  }, [firebaseUser]);

  useEffect(() => {
    if (isFirebaseConfigured && !firebaseUser) {
      stopDriversSync();
      return undefined;
    }

    initDrivers();
    subDispatchers();
    subscribeTrucks();
    return () => { stopDriversSync(); unsubDispatchers(); unsubscribeTrucks(); };
  }, [firebaseUser, initDrivers, stopDriversSync, subDispatchers, unsubDispatchers, subscribeTrucks, unsubscribeTrucks]);

  const searchResults = useMemo(() => {
    if (!search.trim()) return [];

    const query = search.trim().toLowerCase();
    const digits = query.replace(/\D/g, "");

    return drivers
      .filter((driver) => {
        const driverName = String(driver.name || "");
        const driverPhone = String(driver.phone || "");
        const nameLower = driverName.toLowerCase();
        const phoneDigits = driverPhone.replace(/\D/g, "");

        return (
          nameLower.includes(query) ||
          nameLower.split(" ").some((part) => part.startsWith(query)) ||
          driverPhone.toLowerCase().includes(query) ||
          (digits.length >= 3 && phoneDigits.includes(digits))
        );
      })
      .slice(0, 8);
  }, [drivers, search]);

  const showDropdown = searchFocus && search.trim().length > 0;

  const filtered = useMemo(() => {
    const list = drivers.filter((driver) => filterStage === "all" || driver.stage === filterStage);
    return [...list].sort((a, b) => nextActionTs(a) - nextActionTs(b));
  }, [drivers, filterStage]);

  const today = todayStr();
  const yesterdayDate = new Date();
  yesterdayDate.setDate(yesterdayDate.getDate() - 1);
  const yesterday = yesterdayDate.toISOString().split("T")[0];

  const addedToday = drivers.filter((d) => d.createdAt === today).length;
  const addedYesterday = drivers.filter((d) => d.createdAt === yesterday).length;
  const total = drivers.filter((d) => d.stage !== "trash").length;
  const finalStepStages = ["offer_accepted", "drug_test_sched", "drug_test", "set_date", "yard", "hired"];
  const finalStep = drivers.filter((d) => finalStepStages.includes(d.stage)).length;

  const { activeAlerts, dismissAlert } = useDriverAlerts(drivers);

  const todayDateStr = new Date().toISOString().split("T")[0];
  const pendingAlerts = drivers.filter((d) => {
    if (d.stage === "trash" || d.stage === "fired") return false;
    if (!d.nextAction) return false;
    return d.nextAction <= todayDateStr;
  }).sort((a, b) => (a.nextAction < b.nextAction ? -1 : 1));

  function handleAlertReschedule(driverId, newDate, newTime) {
    upd(driverId, { nextAction: newDate, nextActionTime: newTime });
  }

  function handleAlertDone(driverId, toStage) {
    requestStageChange(driverId, toStage);
  }

  function copyTpl(text, id) {
    navigator.clipboard.writeText(text).catch(() => {});
    setCopiedTpl(id);
    setTimeout(() => setCopiedTpl(null), 2000);
  }

  function requestStageChange(driverId, toStage) {
    const driver = drivers.find((item) => item.id === driverId);
    if (!driver || driver.stage === toStage) return;
    setStageModal({ driverId, fromStage: driver.stage, toStage });
  }

  function confirmStageChange({ driverId, toStage, nextAction, nextActionTime, comment, trainedBy }) {
    const patch = { stage: toStage };

    if (nextAction) {
      patch.nextAction = nextAction;
      patch.nextActionTime = nextActionTime || "10:00";
    }

    if (toStage === "hired" && trainedBy) {
      patch.trainedBy = trainedBy;
    } else {
      patch.trainedBy = null;
    }

    upd(driverId, patch);

    if (comment && comment.trim()) {
      const from = STAGES.find((item) => item.id === stageModal?.fromStage)?.label || "";
      const to = STAGES.find((item) => item.id === toStage)?.label || "";
      addNote(driverId, `[Stage: ${from} -> ${to}]\n${comment.trim()}`);
    }

    setStageModal(null);
  }

  function handleAddFile(driverId, fileObj) {
    if (!canManageFiles) return;
    return addFile(driverId, fileObj);
  }

  function handleDeleteFile(driverId, fileIdx) {
    if (!canManageFiles) return;
    removeFile(driverId, fileIdx);
  }

  async function handleLogout() {
    if (!auth) return;
    try {
      await signOut(auth);
      setSelectedId(null);
      setShowAdd(false);
      setStageModal(null);
    } catch {
      // No-op: auth listener remains source of truth for UI state.
    }
  }

  async function handleAssignRole(emailInput, role) {
    if (!db || !firebaseUser) throw new Error("Firebase is not ready.");

    const normalizedEmail = String(emailInput || "").trim().toLowerCase();
    if (!normalizedEmail) throw new Error("Email is required.");
    if (!["user", "admin"].includes(role)) throw new Error("Role must be user or admin.");

    await setDoc(
      doc(db, "user_roles", normalizedEmail),
      {
        email: normalizedEmail,
        role,
        updatedBy: String(firebaseUser.email || "unknown"),
        updatedAt: serverTimestamp(),
      },
      { merge: true },
    );
  }

  const selected = selectedId ? drivers.find((driver) => driver.id === selectedId) : null;

  if (isFirebaseConfigured && (authLoading || !firebaseUser)) {
    return <FirebaseAuthGate />;
  }

  const NAV_ICONS = {
    pipeline: (
      <svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <rect x="2" y="3" width="4" height="14" rx="1.5"/>
        <rect x="8" y="3" width="4" height="9" rx="1.5"/>
        <rect x="14" y="3" width="4" height="11" rx="1.5"/>
      </svg>
    ),
    dispatchers: (
      <svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="7" cy="7" r="3"/>
        <path d="M1 17c0-3.3 2.7-6 6-6"/>
        <circle cx="14" cy="7" r="3"/>
        <path d="M13 17c0-3.3 2.7-6 6-6" strokeOpacity=".4"/>
        <line x1="17" y1="14" x2="17" y2="18"/><line x1="15" y1="16" x2="19" y2="16"/>
      </svg>
    ),
    fleet: (
      <svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <rect x="1" y="7" width="12" height="8" rx="1.5"/>
        <path d="M13 10h3l3 3v2h-6V10z"/>
        <circle cx="5" cy="17" r="1.5" fill="currentColor" stroke="none"/>
        <circle cx="15" cy="17" r="1.5" fill="currentColor" stroke="none"/>
      </svg>
    ),
    dashboard: (
      <svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <rect x="2" y="2" width="7" height="7" rx="1.5"/>
        <rect x="11" y="2" width="7" height="7" rx="1.5"/>
        <rect x="2" y="11" width="7" height="7" rx="1.5"/>
        <rect x="11" y="11" width="7" height="7" rx="1.5"/>
      </svg>
    ),
    templates: (
      <svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="2" width="14" height="16" rx="2"/>
        <line x1="7" y1="7" x2="13" y2="7"/>
        <line x1="7" y1="10" x2="13" y2="10"/>
        <line x1="7" y1="13" x2="11" y2="13"/>
      </svg>
    ),
  };

  const LINK_ICONS = {
    offer: (
      <svg width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M14 2H6a2 2 0 00-2 2v12a2 2 0 002 2h8a2 2 0 002-2V6z"/>
        <polyline points="14,2 14,7 19,7" strokeOpacity=".5"/>
        <line x1="7" y1="10" x2="13" y2="10"/>
        <line x1="7" y1="13" x2="11" y2="13"/>
      </svg>
    ),
    drive: (
      <svg width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M3 17l3.5-6L10 17H3z"/><path d="M10 17l3.5-6 3.5 6H10z"/>
        <path d="M6.5 11L10 5l3.5 6"/>
      </svg>
    ),
    w9: (
      <svg width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="2" width="14" height="16" rx="2"/>
        <line x1="7" y1="8" x2="13" y2="8"/>
        <line x1="7" y1="11" x2="13" y2="11"/>
        <line x1="7" y1="14" x2="10" y2="14"/>
        <circle cx="15" cy="5" r="2" fill="var(--color-primary)" stroke="none"/>
      </svg>
    ),
    med: (
      <svg width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="4" width="14" height="14" rx="2"/>
        <line x1="10" y1="8" x2="10" y2="14"/><line x1="7" y1="11" x2="13" y2="11"/>
        <path d="M7 4V3a1 1 0 011-1h4a1 1 0 011 1v1"/>
      </svg>
    ),
  };

  return (
    <div style={{ display: "flex", height: "100vh", width: "100vw", background: "var(--bg-app)", overflow: "hidden" }}>
      <aside
        style={{
          width: sidebarExpanded ? 220 : 52,
          background: "var(--bg-surface)",
          borderRight: "1px solid var(--border)",
          display: "flex",
          flexDirection: "column",
          padding: "10px 0 14px",
          gap: 2,
          flexShrink: 0,
          transition: "width .2s cubic-bezier(.4,0,.2,1)",
          overflow: "hidden",
          userSelect: "none",
        }}
      >
        {/* Logo row */}
        <div style={{ display: "flex", alignItems: "center", height: 44, padding: sidebarExpanded ? "0 12px" : "0", justifyContent: sidebarExpanded ? "space-between" : "center", marginBottom: 6, flexShrink: 0 }}>
          <div
            onClick={() => setSidebarExpanded(v => !v)}
            title={sidebarExpanded ? "Collapse sidebar" : "Expand sidebar"}
            style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0, cursor: "pointer" }}
          >
            <div style={{ width: 32, height: 32, background: "linear-gradient(135deg,#2563eb,#7c3aed)", borderRadius: 9, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, boxShadow: "0 2px 8px rgba(37,99,235,.3)" }}>
              <svg width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="1" y="7" width="12" height="8" rx="1.5"/>
                <path d="M13 10h3l3 3v2h-6V10z"/>
                <circle cx="5" cy="17" r="1.5" fill="#fff" stroke="none"/>
                <circle cx="15" cy="17" r="1.5" fill="#fff" stroke="none"/>
              </svg>
            </div>
            {sidebarExpanded && (
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: "var(--text-primary)", whiteSpace: "nowrap" }}>Driver ATS</div>
                <div style={{ fontSize: 10, color: "var(--text-faint)", marginTop: 1 }}>Fleet & Hiring</div>
              </div>
            )}
          </div>
          {sidebarExpanded && (
            <button onClick={() => setSidebarExpanded(false)} style={{ width: 24, height: 24, border: "1px solid var(--border)", borderRadius: 6, background: "var(--bg-raised)", cursor: "pointer", color: "var(--text-faint)", fontSize: 10, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M8 2L4 6l4 4"/></svg>
            </button>
          )}
        </div>

        {/* Section: HR */}
        {sidebarExpanded && <div style={{ fontSize: 9, fontWeight: 700, color: "var(--text-faint)", textTransform: "uppercase", letterSpacing: ".1em", padding: "6px 14px 3px" }}>HR</div>}
        {!sidebarExpanded && <div style={{ height: 1, background: "var(--border)", margin: "4px 10px 6px" }} />}

        {[
          { id: "pipeline", title: "Pipeline" },
          { id: "dispatchers", title: "Team Hire" },
        ].map((item) => (
          <button
            key={item.id}
            title={!sidebarExpanded ? item.title : undefined}
            onClick={() => setView(item.id)}
            style={{
              width: sidebarExpanded ? "calc(100% - 16px)" : 36,
              height: 36,
              margin: sidebarExpanded ? "1px 8px" : "1px auto",
              border: "none",
              borderRadius: 8,
              background: view === item.id ? "var(--color-primary-light, #eff6ff)" : "transparent",
              color: view === item.id ? "var(--color-primary, #2563eb)" : "var(--text-muted)",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: 10,
              padding: sidebarExpanded ? "0 10px" : "0",
              justifyContent: sidebarExpanded ? "flex-start" : "center",
              fontWeight: view === item.id ? 600 : 400,
              fontSize: 13,
              transition: "all .15s",
              flexShrink: 0,
            }}
            onMouseEnter={(e) => { if (view !== item.id) e.currentTarget.style.background = "var(--bg-hover)"; }}
            onMouseLeave={(e) => { if (view !== item.id) e.currentTarget.style.background = "transparent"; }}
          >
            <span style={{ flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", width: 18 }}>{NAV_ICONS[item.id]}</span>
            {sidebarExpanded && <span style={{ whiteSpace: "nowrap" }}>{item.title}</span>}
          </button>
        ))}

        {/* Section: Operations */}
        <div style={{ height: 1, background: "var(--border)", margin: "6px 10px" }} />
        {sidebarExpanded && <div style={{ fontSize: 9, fontWeight: 700, color: "var(--text-faint)", textTransform: "uppercase", letterSpacing: ".1em", padding: "2px 14px 3px" }}>Operations</div>}

        {[
          { id: "fleet", title: "Fleet" },
          { id: "dashboard", title: "Dashboard" },
          { id: "templates", title: "Templates" },
        ].map((item) => (
          <button
            key={item.id}
            title={!sidebarExpanded ? item.title : undefined}
            onClick={() => setView(item.id)}
            style={{
              width: sidebarExpanded ? "calc(100% - 16px)" : 36,
              height: 36,
              margin: sidebarExpanded ? "1px 8px" : "1px auto",
              border: "none",
              borderRadius: 8,
              background: view === item.id ? "var(--color-primary-light, #eff6ff)" : "transparent",
              color: view === item.id ? "var(--color-primary, #2563eb)" : "var(--text-muted)",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: 10,
              padding: sidebarExpanded ? "0 10px" : "0",
              justifyContent: sidebarExpanded ? "flex-start" : "center",
              fontWeight: view === item.id ? 600 : 400,
              fontSize: 13,
              transition: "all .15s",
              flexShrink: 0,
            }}
            onMouseEnter={(e) => { if (view !== item.id) e.currentTarget.style.background = "var(--bg-hover)"; }}
            onMouseLeave={(e) => { if (view !== item.id) e.currentTarget.style.background = "transparent"; }}
          >
            <span style={{ flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", width: 18 }}>{NAV_ICONS[item.id]}</span>
            {sidebarExpanded && <span style={{ whiteSpace: "nowrap" }}>{item.title}</span>}
          </button>
        ))}

        {/* Quick links */}
        <div style={{ height: 1, background: "var(--border)", margin: "6px 10px" }} />
        {sidebarExpanded && <div style={{ fontSize: 9, fontWeight: 700, color: "var(--text-faint)", textTransform: "uppercase", letterSpacing: ".1em", padding: "2px 14px 3px" }}>Quick Links</div>}

        {[
          { key: "offer", icon: LINK_ICONS.offer, title: "Send Offer", url: "https://docs.google.com/document/d/1Rul2ihq6Pih4HnZVnYRAK03rDjUmmhciMRSGCmSNrOY/edit?tab=t.0" },
          { key: "drive", icon: LINK_ICONS.drive, title: "Driver Docs", url: "https://drive.google.com/drive/u/0/folders/1PyX6wwLcVwBQCZDqpUQb3sIN8ISerkRV" },
          { key: "w9", icon: LINK_ICONS.w9, title: "W-9 Request", url: "https://drive.google.com/file/d/1VViK6x1BxvRbMuIZhP5_H8y7iLlRMcWk/view?requestEsignature=true" },
          { key: "med", icon: LINK_ICONS.med, title: "Medstop", url: "https://employer.med-stop.com/dashboard" },
        ].map((link) => (
          <a
            key={link.key}
            href={link.url}
            target="_blank"
            rel="noopener noreferrer"
            title={!sidebarExpanded ? link.title : undefined}
            style={{
              width: sidebarExpanded ? "calc(100% - 16px)" : 36,
              height: 34,
              margin: sidebarExpanded ? "1px 8px" : "1px auto",
              border: "none",
              borderRadius: 8,
              background: "transparent",
              color: "var(--text-muted)",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: 10,
              padding: sidebarExpanded ? "0 10px" : "0",
              justifyContent: sidebarExpanded ? "flex-start" : "center",
              fontSize: 12,
              textDecoration: "none",
              transition: "all .15s",
              flexShrink: 0,
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = "var(--bg-hover)"; e.currentTarget.style.borderRadius = "8px"; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
          >
            <span style={{ flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", width: 18 }}>{link.icon}</span>
            {sidebarExpanded && <span style={{ whiteSpace: "nowrap" }}>{link.title}</span>}
          </a>
        ))}

        {/* Stage navigator — only when expanded and pipeline */}
        {sidebarExpanded && view === "pipeline" && (
          <div style={{ flex: 1, marginTop: 8, borderTop: "1px solid var(--border)", paddingTop: 8, minHeight: 0 }}>
            <div style={{ fontSize: 9, fontWeight: 700, color: "var(--text-faint)", letterSpacing: ".1em", textTransform: "uppercase", padding: "0 14px", marginBottom: 4 }}>Columns</div>
            <div style={{ overflowY: "auto", maxHeight: "calc(100vh - 380px)" }}>
              {STAGES.map((stage) => {
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
                    style={{ width: "100%", padding: "5px 14px", border: "none", background: "transparent", cursor: "pointer", display: "flex", alignItems: "center", gap: 8, textAlign: "left", borderRadius: 0 }}
                    onMouseEnter={(e) => { e.currentTarget.style.background = "var(--bg-hover)"; }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
                  >
                    <div style={{ width: 6, height: 6, borderRadius: "50%", background: stage.color, flexShrink: 0 }} />
                    <span style={{ fontSize: 12, color: "var(--text-secondary)", flex: 1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{stage.label}</span>
                    {count > 0 && <span style={{ fontSize: 10, fontWeight: 700, color: "#fff", background: stage.color, borderRadius: 10, padding: "1px 5px", flexShrink: 0 }}>{count}</span>}
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </aside>

      <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
        <header
          style={{
            background: "var(--bg-surface)",
            borderBottom: "1px solid var(--border)",
            padding: "0 20px",
            display: "flex",
            alignItems: "center",
            gap: 10,
            height: 56,
            flexShrink: 0,
          }}
        >
          <div style={{ fontSize: 18, fontWeight: 700, color: "var(--text-primary)", marginRight: 4, letterSpacing: "-.3px", flexShrink: 0 }}>
            Driver CRM
          </div>

          <span className={`role-badge role-badge--${currentRole}`}>
            {roleLoading ? "role..." : currentRole}
          </span>

          <div style={{ position: "relative", flex: "0 0 300px" }}>
            <span style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: "var(--text-faint)", fontSize: 13, pointerEvents: "none" }}>S</span>
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              onFocus={() => setSearchFocus(true)}
              onBlur={() => setTimeout(() => setSearchFocus(false), 160)}
              placeholder="Search by name or phone"
              style={{
                width: "100%",
                padding: "7px 28px 7px 32px",
                fontSize: 13,
                background: "var(--bg-raised)",
                border: `1px solid ${showDropdown ? "var(--color-primary)" : "var(--border)"}`,
                borderRadius: showDropdown ? "8px 8px 0 0" : "8px",
                color: "var(--text-primary)",
                outline: "none",
                transition: "border .15s",
              }}
            />
            {search.trim() && (
              <button
                onClick={() => setSearch("")}
                style={{
                  position: "absolute",
                  right: 8,
                  top: "50%",
                  transform: "translateY(-50%)",
                  background: "none",
                  border: "none",
                  color: "var(--text-faint)",
                  fontSize: 17,
                  cursor: "pointer",
                  lineHeight: 1,
                  padding: 0,
                }}
              >
                x
              </button>
            )}

            {showDropdown && (
              <div
                style={{
                  position: "absolute",
                  top: "100%",
                  left: 0,
                  right: 0,
                  background: "var(--bg-surface)",
                  border: "1px solid var(--color-primary)",
                  borderTop: "none",
                  borderRadius: "0 0 10px 10px",
                  boxShadow: "0 8px 24px rgba(37,99,235,.12)",
                  zIndex: 300,
                  overflow: "hidden",
                }}
              >
                {searchResults.length === 0 ? (
                  <div style={{ padding: "13px 14px", fontSize: 13, color: "var(--text-faint)", textAlign: "center" }}>No drivers found</div>
                ) : (
                  searchResults.map((driver) => {
                    const stage = STAGES.find((item) => item.id === driver.stage) || STAGES[0];
                    const query = search.trim();
                    const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
                    const highlighted = driver.name.replace(new RegExp(`(${escaped})`, "gi"), "|||$1|||");

                    return (
                      <div
                        key={driver.id}
                        onMouseDown={() => {
                          setSelectedId(driver.id);
                          setSearch("");
                          setSearchFocus(false);
                        }}
                        onMouseEnter={(event) => {
                          event.currentTarget.style.background = "var(--bg-hover)";
                        }}
                        onMouseLeave={(event) => {
                          event.currentTarget.style.background = "var(--bg-surface)";
                        }}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                          padding: "10px 14px",
                          cursor: "pointer",
                          borderBottom: "1px solid var(--border)",
                          transition: "background .1s",
                        }}
                      >
                        <div>
                          <div style={{ fontSize: 14, fontWeight: 600, color: "var(--text-primary)" }}>
                            {highlighted.split("|||").map((part, idx) =>
                              part.toLowerCase() === query.toLowerCase() ? (
                                <mark key={idx} style={{ background: "var(--color-today-bg)", color: "var(--color-today-text)", borderRadius: 2, padding: "0 1px" }}>
                                  {part}
                                </mark>
                              ) : (
                                <span key={idx}>{part}</span>
                              ),
                            )}
                          </div>
                          <div style={{ fontSize: 11, color: "var(--text-faint)", marginTop: 1 }}>
                            {driver.phone} · {driver.city}
                          </div>
                        </div>
                        <span
                          style={{
                            fontSize: 11,
                            background: stage.light,
                            color: stage.color,
                            borderRadius: 20,
                            padding: "2px 8px",
                            fontWeight: 600,
                            whiteSpace: "nowrap",
                          }}
                        >
                          {stage.label}
                        </span>
                      </div>
                    );
                  })
                )}
                <div style={{ padding: "6px 14px", fontSize: 11, color: "var(--text-faint)", background: "var(--bg-subtle)", borderTop: "1px solid var(--border)" }}>
                  {searchResults.length > 0
                    ? `${searchResults.length} result${searchResults.length !== 1 ? "s" : ""} · click to open`
                    : ""}
                </div>
              </div>
            )}
          </div>

          <select
            value={filterStage}
            onChange={(event) => setFilterStage(event.target.value)}
            style={{
              padding: "7px 10px",
              fontSize: 13,
              background: "var(--bg-raised)",
              border: "1px solid var(--border)",
              borderRadius: 8,
              color: "var(--text-secondary)",
              outline: "none",
            }}
          >
            <option value="all">All stages</option>
            {STAGES.map((stage) => (
              <option key={stage.id} value={stage.id}>{stage.label}</option>
            ))}
          </select>

          {/* Compact stats */}
          <div style={{ display: "flex", gap: 5, flexShrink: 0 }}>
            <SPill n={addedToday} l="Today" c="#2563eb" bg="#eff6ff" />
            <SPill n={total} l="Total" c="#6366f1" bg="#eef2ff" />
            <SPill n={finalStep} l="Final" c="#059669" bg="#ecfdf5" />
          </div>

          {/* Theme switcher — icons only */}
          <div style={{ display: "flex", gap: 2, background: "var(--bg-raised)", border: "1px solid var(--border)", borderRadius: 8, padding: 2, flexShrink: 0 }}>
            {THEMES.map((t) => {
              const icon = t === "normal" ? "☀️" : t === "dark" ? "🌙" : "◑";
              return (
                <button
                  key={t}
                  onClick={() => setTheme(t)}
                  title={t === "normal" ? "Normal" : t === "hc" ? "High Contrast" : "Dark"}
                  style={{
                    width: 28, height: 28,
                    borderRadius: 6, border: "none", fontSize: 14,
                    cursor: "pointer",
                    background: theme === t ? "var(--color-primary)" : "transparent",
                    transition: "all .15s", lineHeight: 1,
                    display: "flex", alignItems: "center", justifyContent: "center",
                  }}
                >
                  {icon}
                </button>
              );
            })}
          </div>

          <div style={{ marginLeft: "auto", display: "flex", gap: 6, flexShrink: 0, alignItems: "center" }}>

            {/* Tools dropdown */}
            <div style={{ position: "relative" }}>
              <button
                onClick={() => setShowToolsMenu(v => !v)}
                onBlur={() => setTimeout(() => setShowToolsMenu(false), 150)}
                style={{
                  background: "var(--bg-raised)", border: "1px solid var(--border)",
                  color: "var(--text-secondary)", padding: "7px 12px", borderRadius: 8,
                  fontSize: 13, fontWeight: 600, cursor: "pointer",
                  display: "flex", alignItems: "center", gap: 5,
                }}
              >
                ⚙ Tools ▾
              </button>
              {showToolsMenu && (
                <div style={{
                  position: "absolute", top: "calc(100% + 4px)", right: 0,
                  background: "var(--bg-surface)", border: "1px solid var(--border)",
                  borderRadius: 10, boxShadow: "0 8px 24px rgba(0,0,0,.12)",
                  zIndex: 300, minWidth: 170, overflow: "hidden",
                }}>
                  {[
                    { icon: "⏰", label: pendingAlerts.length > 0 ? `Alerts (${pendingAlerts.length})` : "Alerts", action: () => { setAlertsPanelOpen(v => !v); setShowToolsMenu(false); } },
                    { icon: "📊", label: "Daily Report",  action: () => { setShowDailyReport(true); setShowToolsMenu(false); } },
                    { icon: "🔍", label: "Find Duplicates", action: () => { setShowDuplicates(true); setShowToolsMenu(false); } },
                    ...(currentRole === "root" || currentRole === "admin" ? [{
                      icon: "🚛", label: "Set all → Conestoga",
                      action: async () => {
                        setShowToolsMenu(false);
                        if (!window.confirm("Set jobType = 'Conestoga' for all drivers that don't have a job type yet?")) return;
                        const toUpdate = drivers.filter(d => !d.jobType);
                        for (const d of toUpdate) await upd(d.id, { jobType: "Conestoga" });
                        alert(`Done! ${toUpdate.length} drivers updated.`);
                      }
                    }] : []),
                  ].map(item => (
                    <button key={item.label} onClick={item.action}
                      style={{
                        width: "100%", padding: "10px 14px", border: "none",
                        background: "transparent", cursor: "pointer", textAlign: "left",
                        fontSize: 13, color: "var(--text-primary)", display: "flex",
                        alignItems: "center", gap: 8,
                      }}
                      onMouseEnter={e => e.currentTarget.style.background = "var(--bg-hover)"}
                      onMouseLeave={e => e.currentTarget.style.background = "transparent"}
                    >
                      <span>{item.icon}</span> {item.label}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <button
              onClick={() => setShowIndeed(true)}
              style={{
                background: "#eff6ff", border: "1px solid #bfdbfe", color: "#1d4ed8",
                padding: "7px 12px", borderRadius: 8, fontSize: 13, fontWeight: 600,
                cursor: "pointer", display: "flex", alignItems: "center", gap: 5,
              }}
            >
              📋 Import
            </button>

            <button
              onClick={() => setShowAdd(true)}
              className="btn-p"
              style={{
                background: "var(--color-primary)", border: "none", color: "#fff",
                padding: "7px 14px", borderRadius: 8, fontSize: 13, fontWeight: 600,
                cursor: "pointer", display: "flex", alignItems: "center", gap: 5,
              }}
            >
              + Add Driver
            </button>
          </div>

          {isFirebaseConfigured && auth && (
            <button
              onClick={handleLogout}
              className="btn-g"
              title="Logout"
              style={{
                background: "var(--bg-raised)",
                border: "1px solid var(--border)",
                color: "var(--text-muted)",
                padding: "7px 10px",
                borderRadius: 8,
                fontSize: 16,
                cursor: "pointer",
                flexShrink: 0,
              }}
            >
              ⏻
            </button>
          )}

          {canManageRoles && (
            <button
              onClick={() => setShowRoleModal(true)}
              className="btn-g"
              style={{
                background: "var(--bg-raised)",
                border: "1px solid var(--border)",
                color: "var(--text-secondary)",
                padding: "8px 12px",
                borderRadius: 8,
                fontSize: 12,
                fontWeight: 600,
                cursor: "pointer",
                flexShrink: 0,
              }}
            >
              Roles
            </button>
          )}
        </header>

        {isLoading && (
          <div
            style={{
              padding: "8px 14px",
              borderBottom: "1px solid var(--color-primary-border)",
              background: "var(--color-primary-light)",
              color: "var(--color-primary-dark)",
              fontSize: 12,
              fontWeight: 600,
            }}
          >
            Syncing drivers from Firebase...
          </div>
        )}

        {!isLoading && syncError && (
          <div
            style={{
              padding: "8px 14px",
              borderBottom: "1px solid var(--color-warning-border)",
              background: "var(--color-warning-bg)",
              color: "var(--color-warning-text)",
              fontSize: 12,
            }}
          >
            {syncError}
          </div>
        )}

        <div style={{ flex: 1, overflow: "hidden", display: "flex", minWidth: 0 }}>
          {view === "pipeline" && (
            <PipelineView
              stages={STAGES}
              filteredDrivers={filtered}
              onSelectDriver={setSelectedId}
              onDropDriverToStage={requestStageChange}
            />
          )}

          {view === "dispatchers" && <div style={{ flex: 1, minWidth: 0, overflow: "hidden" }}><DispatchersView /></div>}

          {view === "fleet" && <div style={{ flex: 1, minWidth: 0, overflow: "hidden", display: "flex", flexDirection: "column" }}><TrucksView /></div>}

          {view === "dashboard" && <div style={{ flex: 1, minWidth: 0, overflow: "hidden" }}><DashboardView drivers={drivers} /></div>}

          {view === "templates" && <div style={{ flex: 1, minWidth: 0, overflow: "hidden" }}><TemplatesView copiedTpl={copiedTpl} onCopy={copyTpl} /></div>}
        </div>
      </div>

      {selected && (
        <DriverDrawer
          driver={selected}
          onClose={() => setSelectedId(null)}
          onUpd={upd}
          onNote={addNote}
          onFile={handleAddFile}
          onDeleteFile={handleDeleteFile}
          canManageFiles={canManageFiles}
          onStageChange={requestStageChange}
          onDelete={(id) => { deleteDriver(id); setSelectedId(null); }}
        />
      )}

      {showAdd && (
        <AddModal
          drivers={drivers}
          onClose={() => setShowAdd(false)}
          onAdd={(data) => {
            addDriver(data);
            setShowAdd(false);
          }}
        />
      )}

      {showIndeed && (
        <ImportIndeedModal
          drivers={drivers}
          onClose={() => setShowIndeed(false)}
          onImport={async (leads, onProgress) => {
            let done = 0;
            let errors = 0;
            for (const lead of leads) {
              try {
                await addDriver(lead);
              } catch {
                errors++;
              }
              done++;
              onProgress(done);
            }
            return { errors };
          }}
        />
      )}

      {showDailyReport && (
        <DailyReportModal
          drivers={drivers}
          currentUser={firebaseUser?.email || ""}
          onClose={() => setShowDailyReport(false)}
        />
      )}

      {showDuplicates && (
        <DuplicatesModal
          drivers={drivers}
          onDelete={deleteDriver}
          onClose={() => setShowDuplicates(false)}
        />
      )}

      {stageModal && (
        <StageModal
          modal={stageModal}
          onConfirm={confirmStageChange}
          onCancel={() => setStageModal(null)}
        />
      )}

      {showRoleModal && canManageRoles && (
        <RoleManagerModal
          onClose={() => setShowRoleModal(false)}
          onAssignRole={handleAssignRole}
        />
      )}

      <DriverAlertsPanel
        alerts={pendingAlerts}
        onReschedule={handleAlertReschedule}
        onDone={handleAlertDone}
        onDriverClick={setSelectedId}
        open={alertsPanelOpen}
        onToggle={() => setAlertsPanelOpen(false)}
      />
    </div>
  );
}
