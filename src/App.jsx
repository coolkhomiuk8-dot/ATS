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
import StageModal from "./components/StageModal";
import FirebaseAuthGate from "./components/FirebaseAuthGate";
import RoleManagerModal from "./components/RoleManagerModal";
import { auth, db, isFirebaseConfigured } from "./lib/firebase";
import { useDispatchersStore } from "./store/useDispatchersStore";

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
  const [filterStage, setFilterStage] = useState("all");
  const [search, setSearch] = useState("");
  const [searchFocus, setSearchFocus] = useState(false);
  const [sidebarExpanded, setSidebarExpanded] = useState(false);
  const [copiedTpl, setCopiedTpl] = useState(null);
  const [stageModal, setStageModal] = useState(null);
  const [showRoleModal, setShowRoleModal] = useState(false);
  const [currentRole, setCurrentRole] = useState("user");
  const [roleLoading, setRoleLoading] = useState(true);

  const { theme, setTheme, THEMES, LABELS } = useTheme();

  const canManageRoles = currentRole === "root";
  const canManageFiles = currentRole === "root" || currentRole === "admin";

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
    return () => { stopDriversSync(); unsubDispatchers(); };
  }, [firebaseUser, initDrivers, stopDriversSync, subDispatchers, unsubDispatchers]);

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

  return (
    <div style={{ display: "flex", height: "100vh", background: "var(--bg-app)", overflow: "hidden" }}>
      <aside
        style={{
          width: sidebarExpanded ? 200 : 58,
          background: "var(--bg-surface)",
          borderRight: "1px solid var(--border)",
          display: "flex",
          flexDirection: "column",
          alignItems: sidebarExpanded ? "flex-start" : "center",
          padding: "14px 0",
          gap: 4,
          flexShrink: 0,
          transition: "width .2s ease",
          overflow: "hidden",
        }}
      >
        {/* Logo + toggle */}
        <div style={{ display: "flex", alignItems: "center", gap: 8, width: "100%", padding: sidebarExpanded ? "0 10px" : "0", marginBottom: 14, justifyContent: sidebarExpanded ? "space-between" : "center" }}>
          <div style={{ width: 34, height: 34, background: "var(--color-primary)", borderRadius: 9, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, color: "#fff", fontWeight: 700, flexShrink: 0 }}>
            CRM
          </div>
          {sidebarExpanded && <span style={{ fontSize: 13, fontWeight: 700, color: "var(--text-primary)" }}>Driver CRM</span>}
          <button onClick={() => setSidebarExpanded(v => !v)} title={sidebarExpanded ? "Collapse" : "Expand"} style={{ width: 26, height: 26, border: "1px solid var(--border)", borderRadius: 6, background: "var(--bg-raised)", cursor: "pointer", color: "var(--text-muted)", fontSize: 13, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            {sidebarExpanded ? "←" : "→"}
          </button>
        </div>

        {/* Nav items */}
        {[
          { id: "pipeline", icon: "PL", title: "Pipeline" },
          { id: "dispatchers", icon: "DS", title: "Team Hire" },
          { id: "dashboard", icon: "DB", title: "Dashboard" },
          { id: "templates", icon: "TP", title: "Templates" },
        ].map((item) => (
          <button
            key={item.id}
            className="nav-item"
            title={item.title}
            onClick={() => setView(item.id)}
            style={{
              width: sidebarExpanded ? "calc(100% - 16px)" : 38,
              height: 38,
              margin: sidebarExpanded ? "0 8px" : "0",
              border: "none",
              borderRadius: 9,
              background: view === item.id ? "var(--color-primary-light)" : "transparent",
              color: view === item.id ? "var(--color-primary)" : "var(--text-faint)",
              fontSize: 11,
              fontWeight: 700,
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: sidebarExpanded ? "flex-start" : "center",
              gap: 8,
              padding: sidebarExpanded ? "0 10px" : "0",
              transition: "all .15s",
              whiteSpace: "nowrap",
            }}
          >
            <span>{item.icon}</span>
            {sidebarExpanded && <span style={{ fontSize: 13 }}>{item.title}</span>}
          </button>
        ))}

        {/* Quick links */}
        {[
          { icon: "📄", title: "Send Offer", url: "https://docs.google.com/document/d/1Rul2ihq6Pih4HnZVnYRAK03rDjUmmhciMRSGCmSNrOY/edit?tab=t.0" },
          { icon: "📁", title: "Driver Docs", url: "https://drive.google.com/drive/u/0/folders/1PyX6wwLcVwBQCZDqpUQb3sIN8ISerkRV" },
          { icon: "📝", title: "W-9 Request", url: "https://drive.google.com/file/d/1VViK6x1BxvRbMuIZhP5_H8y7iLlRMcWk/view?requestEsignature=true" },
          { icon: "🏥", title: "Medstop", url: "https://employer.med-stop.com/dashboard" },
        ].map((link) => (
          <a
            key={link.title}
            href={link.url}
            target="_blank"
            rel="noopener noreferrer"
            title={link.title}
            style={{
              width: sidebarExpanded ? "calc(100% - 16px)" : 38,
              height: 38,
              margin: sidebarExpanded ? "2px 8px" : "2px 0",
              border: "1px solid var(--border)",
              borderRadius: 9,
              background: "var(--bg-raised)",
              color: "var(--text-muted)",
              fontSize: 11,
              fontWeight: 600,
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: sidebarExpanded ? "flex-start" : "center",
              gap: 8,
              padding: sidebarExpanded ? "0 10px" : "0",
              textDecoration: "none",
              transition: "all .15s",
              whiteSpace: "nowrap",
              flexShrink: 0,
            }}
          >
            <span style={{ fontSize: 15 }}>{link.icon}</span>
            {sidebarExpanded && <span style={{ fontSize: 12 }}>{link.title}</span>}
          </a>
        ))}

        {/* Stage navigator — only when expanded and pipeline */}
        {sidebarExpanded && view === "pipeline" && (
          <div style={{ width: "100%", marginTop: 12, borderTop: "1px solid var(--border)", paddingTop: 10 }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: "var(--text-faint)", letterSpacing: ".06em", textTransform: "uppercase", padding: "0 14px", marginBottom: 6 }}>Columns</div>
            <div style={{ overflowY: "auto", maxHeight: "calc(100vh - 280px)" }}>
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
                    style={{
                      width: "100%",
                      padding: "6px 14px",
                      border: "none",
                      background: "transparent",
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "center",
                      gap: 7,
                      textAlign: "left",
                      borderRadius: 0,
                    }}
                  >
                    <div style={{ width: 7, height: 7, borderRadius: "50%", background: stage.color, flexShrink: 0 }} />
                    <span style={{ fontSize: 12, color: "var(--text-secondary)", flex: 1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{stage.label}</span>
                    {count > 0 && <span style={{ fontSize: 10, fontWeight: 700, color: "#fff", background: stage.color, borderRadius: 10, padding: "1px 6px", flexShrink: 0 }}>{count}</span>}
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

          <div style={{ display: "flex", gap: 6 }}>
            <SPill n={addedToday} l="Added today" c="#2563eb" bg="#eff6ff" />
            <SPill n={addedYesterday} l="Added yesterday" c="#7c3aed" bg="#f5f3ff" />
            <SPill n={total} l="Total" c="#6366f1" bg="#eef2ff" />
            <SPill n={finalStep} l="Final step" c="#059669" bg="#ecfdf5" />
          </div>

          {/* Theme switcher */}
          <div style={{ display: "flex", gap: 2, background: "var(--bg-raised)", border: "1px solid var(--border)", borderRadius: 8, padding: 2, flexShrink: 0 }}>
            {THEMES.map((t) => (
              <button
                key={t}
                onClick={() => setTheme(t)}
                title={t === "normal" ? "Normal" : t === "hc" ? "High Contrast" : "Dark"}
                style={{
                  padding: "4px 8px",
                  borderRadius: 6,
                  border: "none",
                  fontSize: 13,
                  cursor: "pointer",
                  background: theme === t ? "var(--color-primary)" : "transparent",
                  color: theme === t ? "#fff" : "var(--text-muted)",
                  fontWeight: theme === t ? 700 : 400,
                  transition: "all .15s",
                  lineHeight: 1,
                }}
              >
                {LABELS[t]}
              </button>
            ))}
          </div>

          <div style={{ marginLeft: "auto", display: "flex", gap: 8, flexShrink: 0 }}>
            <button
              onClick={() => setShowDuplicates(true)}
              style={{
                background: "#fff7ed",
                border: "1px solid #fed7aa",
                color: "#c2410c",
                padding: "8px 14px",
                borderRadius: 8,
                fontSize: 13,
                fontWeight: 600,
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                gap: 5,
              }}
            >
              🔍 Duplicates
            </button>
            <button
              onClick={() => setShowIndeed(true)}
              style={{
                background: "#eff6ff",
                border: "1px solid #bfdbfe",
                color: "#1d4ed8",
                padding: "8px 14px",
                borderRadius: 8,
                fontSize: 13,
                fontWeight: 600,
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                gap: 5,
              }}
            >
              📋 Import Indeed
            </button>
            <button
              onClick={() => setShowAdd(true)}
              className="btn-p"
              style={{
                background: "var(--color-primary)",
                border: "none",
                color: "#fff",
                padding: "8px 16px",
                borderRadius: 8,
                fontSize: 13,
                fontWeight: 600,
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                gap: 5,
              }}
            >
              Add Driver
            </button>
          </div>

          {isFirebaseConfigured && auth && (
            <button
              onClick={handleLogout}
              className="btn-g"
              style={{
                background: "var(--bg-raised)",
                border: "1px solid var(--border)",
                color: "var(--text-muted)",
                padding: "8px 12px",
                borderRadius: 8,
                fontSize: 12,
                fontWeight: 600,
                cursor: "pointer",
                flexShrink: 0,
              }}
            >
              Logout
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

        <div style={{ flex: 1, overflow: "hidden", display: "flex" }}>
          {view === "pipeline" && (
            <PipelineView
              stages={STAGES}
              filteredDrivers={filtered}
              onSelectDriver={setSelectedId}
              onDropDriverToStage={requestStageChange}
            />
          )}

          {view === "dispatchers" && <DispatchersView />}

          {view === "dashboard" && <DashboardView drivers={drivers} />}

          {view === "templates" && <TemplatesView copiedTpl={copiedTpl} onCopy={copyTpl} />}
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
        alerts={activeAlerts}
        onReschedule={handleAlertReschedule}
        onDone={handleAlertDone}
        onDismiss={dismissAlert}
      />
    </div>
  );
}
