import { useEffect, useMemo, useState } from "react";
import { STAGES } from "./constants/data";
import { minutesUntil, nextActionTs, todayStr } from "./utils/date";
import { useDriversStore } from "./store/useDriversStore";
import { SPill } from "./components/UiBits";
import PipelineView from "./components/PipelineView";
import DashboardView from "./views/DashboardView";
import TemplatesView from "./views/TemplatesView";
import DriverDrawer from "./components/DriverDrawer";
import AddModal from "./components/AddModal";
import StageModal from "./components/StageModal";

export default function App() {
  const { drivers, upd, addNote, addFile, addDriver, initDrivers, stopDriversSync, isLoading, syncError } = useDriversStore();

  const [view, setView] = useState("pipeline");
  const [selectedId, setSelectedId] = useState(null);
  const [showAdd, setShowAdd] = useState(false);
  const [filterStage, setFilterStage] = useState("all");
  const [search, setSearch] = useState("");
  const [searchFocus, setSearchFocus] = useState(false);
  const [copiedTpl, setCopiedTpl] = useState(null);
  const [stageModal, setStageModal] = useState(null);

  useEffect(() => {
    initDrivers();
    return () => stopDriversSync();
  }, [initDrivers, stopDriversSync]);

  const searchResults = useMemo(() => {
    if (!search.trim()) return [];

    const query = search.trim().toLowerCase();
    const digits = query.replace(/\D/g, "");

    return drivers
      .filter((driver) => {
        const nameLower = driver.name.toLowerCase();
        const phoneDigits = driver.phone.replace(/\D/g, "");

        return (
          nameLower.includes(query) ||
          nameLower.split(" ").some((part) => part.startsWith(query)) ||
          driver.phone.toLowerCase().includes(query) ||
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

  const overdue = drivers.filter((driver) => {
    const mins = minutesUntil(driver);
    return mins !== null && mins < 0 && !["hired", "cold"].includes(driver.stage);
  }).length;

  const stale = drivers.filter(
    (driver) =>
      driver.lastContact &&
      (new Date(todayStr()) - new Date(driver.lastContact)) / 86400000 >= 3 &&
      !["hired", "cold"].includes(driver.stage),
  ).length;

  const hot = drivers.filter(
    (driver) => driver.interest === "Hot" && !["hired", "cold"].includes(driver.stage),
  ).length;

  const hired = drivers.filter((driver) => driver.stage === "hired").length;

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

  const selected = selectedId ? drivers.find((driver) => driver.id === selectedId) : null;

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
            <SPill n={drivers.length} l="Total" c="#6366f1" bg="#eef2ff" />
            {overdue > 0 && <SPill n={overdue} l="Overdue" c="#dc2626" bg="#fef2f2" />}
            {stale > 0 && <SPill n={stale} l="Stale" c="#d97706" bg="#fffbeb" />}
            <SPill n={hot} l="Hot" c="#059669" bg="#ecfdf5" />
            <SPill n={hired} l="Hired" c="#2563eb" bg="#eff6ff" />
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
    </div>
  );
}
