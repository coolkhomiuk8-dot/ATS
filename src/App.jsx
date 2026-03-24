import { useEffect, useMemo, useState } from "react";
import { onAuthStateChanged, signOut } from "firebase/auth";
import { doc, getDoc, serverTimestamp, setDoc } from "firebase/firestore";
import { STAGES } from "./constants/data";
import { nextActionTs, todayStr } from "./utils/date";
import { useDriversStore } from "./store/useDriversStore";
import { SPill } from "./components/UiBits";
import { useDriverAlerts } from "./hooks/useDriverAlerts";
import DriverAlertsPanel from "./components/DriverAlertsPanel";
import PipelineView from "./components/PipelineView";
import DashboardView from "./views/DashboardView";
import TemplatesView from "./views/TemplatesView";
import DriverDrawer from "./components/DriverDrawer";
import AddModal from "./components/AddModal";
import StageModal from "./components/StageModal";
import FirebaseAuthGate from "./components/FirebaseAuthGate";
import RoleManagerModal from "./components/RoleManagerModal";
import { auth, db, isFirebaseConfigured } from "./lib/firebase";

export default function App() {
  const { drivers, upd, addNote, addFile, removeFile, addDriver, initDrivers, stopDriversSync, isLoading, syncError } = useDriversStore();
  const [firebaseUser, setFirebaseUser] = useState(() => auth?.currentUser || null);
  const [authLoading, setAuthLoading] = useState(isFirebaseConfigured);

  const [view, setView] = useState("pipeline");
  const [selectedId, setSelectedId] = useState(null);
  const [showAdd, setShowAdd] = useState(false);
  const [filterStage, setFilterStage] = useState("all");
  const [search, setSearch] = useState("");
  const [searchFocus, setSearchFocus] = useState(false);
  const [copiedTpl, setCopiedTpl] = useState(null);
  const [stageModal, setStageModal] = useState(null);
  const [showRoleModal, setShowRoleModal] = useState(false);
  const [currentRole, setCurrentRole] = useState("user");
  const [roleLoading, setRoleLoading] = useState(true);

  const canManageRoles = currentRole === "root";

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
    return () => stopDriversSync();
  }, [firebaseUser, initDrivers, stopDriversSync]);

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

  function confirmStageChange({ driverId, toStage, nextAction, nextActionTime, comment }) {
    const patch = { stage: toStage };

    if (nextAction) {
      patch.nextAction = nextAction;
      patch.nextActionTime = nextActionTime || "10:00";
    }

    upd(driverId, patch);

    if (comment && comment.trim()) {
      const from = STAGES.find((item) => item.id === stageModal?.fromStage)?.label || "";
      const to = STAGES.find((item) => item.id === toStage)?.label || "";
      addNote(driverId, `[Stage: ${from} -> ${to}]\n${comment.trim()}`);
    }

    setStageModal(null);
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
    <div style={{ display: "flex", height: "100vh", background: "#f1f5f9", overflow: "hidden" }}>
      <aside
        style={{
          width: 58,
          background: "#fff",
          borderRight: "1px solid #e2e8f0",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          padding: "14px 0",
          gap: 4,
          flexShrink: 0,
        }}
      >
        <div
          style={{
            width: 34,
            height: 34,
            background: "#2563eb",
            borderRadius: 9,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            marginBottom: 14,
            fontSize: 12,
            color: "#fff",
            fontWeight: 700,
          }}
        >
          CRM
        </div>

        {[
          { id: "pipeline", icon: "PL", title: "Pipeline" },
          { id: "dashboard", icon: "DB", title: "Dashboard" },
          { id: "templates", icon: "TP", title: "Templates" },
        ].map((item) => (
          <button
            key={item.id}
            className="nav-item"
            title={item.title}
            onClick={() => setView(item.id)}
            style={{
              width: 38,
              height: 38,
              border: "none",
              borderRadius: 9,
              background: view === item.id ? "#eff6ff" : "transparent",
              color: view === item.id ? "#2563eb" : "#94a3b8",
              fontSize: 11,
              fontWeight: 700,
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              transition: "all .15s",
            }}
          >
            {item.icon}
          </button>
        ))}
      </aside>

      <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
        <header
          style={{
            background: "#fff",
            borderBottom: "1px solid #e2e8f0",
            padding: "0 20px",
            display: "flex",
            alignItems: "center",
            gap: 10,
            height: 56,
            flexShrink: 0,
          }}
        >
          <div style={{ fontSize: 18, fontWeight: 700, color: "#0f172a", marginRight: 4, letterSpacing: "-.3px", flexShrink: 0 }}>
            Driver CRM
          </div>

          <span className={`role-badge role-badge--${currentRole}`}>
            {roleLoading ? "role..." : currentRole}
          </span>

          <div style={{ position: "relative", flex: "0 0 300px" }}>
            <span style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: "#94a3b8", fontSize: 13, pointerEvents: "none" }}>S</span>
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
                background: "#f8fafc",
                border: `1px solid ${showDropdown ? "#2563eb" : "#e2e8f0"}`,
                borderRadius: showDropdown ? "8px 8px 0 0" : "8px",
                color: "#0f172a",
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
                  color: "#94a3b8",
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
                  background: "#fff",
                  border: "1px solid #2563eb",
                  borderTop: "none",
                  borderRadius: "0 0 10px 10px",
                  boxShadow: "0 8px 24px rgba(37,99,235,.12)",
                  zIndex: 300,
                  overflow: "hidden",
                }}
              >
                {searchResults.length === 0 ? (
                  <div style={{ padding: "13px 14px", fontSize: 13, color: "#94a3b8", textAlign: "center" }}>No drivers found</div>
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
                          event.currentTarget.style.background = "#f0f7ff";
                        }}
                        onMouseLeave={(event) => {
                          event.currentTarget.style.background = "#fff";
                        }}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                          padding: "10px 14px",
                          cursor: "pointer",
                          borderBottom: "1px solid #f1f5f9",
                          transition: "background .1s",
                        }}
                      >
                        <div>
                          <div style={{ fontSize: 14, fontWeight: 600, color: "#0f172a" }}>
                            {highlighted.split("|||").map((part, idx) =>
                              part.toLowerCase() === query.toLowerCase() ? (
                                <mark key={idx} style={{ background: "#dbeafe", color: "#1d4ed8", borderRadius: 2, padding: "0 1px" }}>
                                  {part}
                                </mark>
                              ) : (
                                <span key={idx}>{part}</span>
                              ),
                            )}
                          </div>
                          <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 1 }}>
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
                <div style={{ padding: "6px 14px", fontSize: 11, color: "#94a3b8", background: "#fafafa", borderTop: "1px solid #f1f5f9" }}>
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
              background: "#f8fafc",
              border: "1px solid #e2e8f0",
              borderRadius: 8,
              color: "#374151",
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

          <button
            onClick={() => setShowAdd(true)}
            className="btn-p"
            style={{
              marginLeft: "auto",
              background: "#2563eb",
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
              flexShrink: 0,
            }}
          >
            Add Driver
          </button>

          {isFirebaseConfigured && auth && (
            <button
              onClick={handleLogout}
              className="btn-g"
              style={{
                background: "#f8fafc",
                border: "1px solid #e2e8f0",
                color: "#475569",
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
                background: "#f8fafc",
                border: "1px solid #e2e8f0",
                color: "#334155",
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
              borderBottom: "1px solid #dbeafe",
              background: "#eff6ff",
              color: "#1d4ed8",
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
              borderBottom: "1px solid #fed7aa",
              background: "#fff7ed",
              color: "#9a3412",
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
          onFile={addFile}
          onDeleteFile={removeFile}
          onStageChange={requestStageChange}
        />
      )}

      {showAdd && (
        <AddModal
          onClose={() => setShowAdd(false)}
          onAdd={(data) => {
            addDriver(data);
            setShowAdd(false);
          }}
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
