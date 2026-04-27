import { useState, useMemo } from "react";
import { useTrucksStore } from "../store/useTrucksStore";
import { useDriversStore } from "../store/useDriversStore";
import { TRUCK_STATUSES, TRUCK_DOC_LIST, TRUCK_COMPANIES, OIL_CHANGE_INTERVAL } from "../constants/truckData";
import TruckDrawer from "../components/TruckDrawer";

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

function OilBar({ last, current }) {
  const interval = OIL_CHANGE_INTERVAL;
  const left = interval - (Number(current) - Number(last));
  const pct = Math.max(0, Math.min(100, (left / interval) * 100));
  const color = left < 0 ? "#dc2626" : left < 1500 ? "#f59e0b" : "#16a34a";
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: "var(--text-faint)", marginBottom: 3 }}>
        <span>{Number(last).toLocaleString()} mi</span>
        <span style={{ color, fontWeight: 700 }}>
          {left >= 0 ? `${left.toLocaleString()} left` : `${Math.abs(left).toLocaleString()} overdue`}
        </span>
      </div>
      <div style={{ height: 4, borderRadius: 99, background: "var(--bg-hover)", overflow: "hidden" }}>
        <div style={{ height: "100%", width: `${pct}%`, background: color, borderRadius: 99, transition: "width .3s" }} />
      </div>
    </div>
  );
}

function TruckCard({ truck, driver, onClick }) {
  const vinShort = truck.vinNumber ? truck.vinNumber.slice(-6) : "—";
  const docsCount = Object.values(truck.docs || {}).filter(Boolean).length;

  return (
    <div
      onClick={onClick}
      style={{
        background: "var(--bg-surface)",
        border: "1px solid var(--border)",
        borderRadius: 12,
        padding: "14px 16px",
        cursor: "pointer",
        transition: "all .15s",
        display: "flex",
        flexDirection: "column",
        gap: 8,
      }}
      onMouseEnter={(e) => { e.currentTarget.style.borderColor = "var(--color-primary)"; e.currentTarget.style.boxShadow = "0 4px 16px rgba(37,99,235,.1)"; }}
      onMouseLeave={(e) => { e.currentTarget.style.borderColor = "var(--border)"; e.currentTarget.style.boxShadow = "none"; }}
    >
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ fontSize: 22, fontWeight: 800, color: "var(--text-primary)", letterSpacing: "-1px" }}>
          Unit {truck.unitNumber || "—"}
        </div>
        <div style={{ display: "flex", gap: 5, alignItems: "center" }}>
          {(!truck.insuranceStatus || truck.insuranceStatus === "none") && (
            <span style={{ fontSize: 9, fontWeight: 700, padding: "2px 6px", borderRadius: 4, background: "#fef2f2", color: "#dc2626", border: "1px solid #fecaca" }}>
              ⚠ No Ins.
            </span>
          )}
          <StatusBadge status={truck.status} />
        </div>
      </div>

      {/* Meta row */}
      <div style={{ fontSize: 12, color: "var(--text-muted)", display: "flex", gap: 8, flexWrap: "wrap" }}>
        <span>{truck.year || "—"}</span>
        {truck.truckCompany && <span style={{ fontWeight: 600, color: "var(--text-secondary)" }}>{truck.truckCompany}</span>}
        {truck.eldId && <span style={{ background: "var(--bg-raised)", border: "1px solid var(--border)", borderRadius: 5, padding: "1px 6px", fontSize: 11 }}>ELD: {truck.eldId}</span>}
      </div>

      {/* VIN */}
      <div style={{ fontSize: 11, color: "var(--text-faint)", fontFamily: "monospace" }}>
        VIN ...{vinShort}
      </div>

      {/* Driver */}
      <div style={{
        background: driver ? "var(--color-primary-light)" : "var(--bg-raised)",
        border: `1px solid ${driver ? "var(--color-primary-border)" : "var(--border)"}`,
        borderRadius: 7,
        padding: "6px 10px",
        fontSize: 12,
        color: driver ? "var(--color-primary-dark)" : "var(--text-faint)",
        fontWeight: driver ? 600 : 400,
      }}>
        {driver ? `🚗 ${driver.name}` : "Available — no driver assigned"}
      </div>

      {/* Fuel card */}
      {truck.fuelCard && (
        <div style={{ fontSize: 11, color: "var(--text-muted)", fontFamily: "monospace" }}>
          Fuel: {truck.fuelCard}
        </div>
      )}

      {/* Oil change bar */}
      {(truck.lastOilChange || truck.currentOdometer) ? (
        <OilBar last={truck.lastOilChange} current={truck.currentOdometer} />
      ) : null}

      {/* Docs mini badges */}
      <div style={{ display: "flex", gap: 3, flexWrap: "wrap" }}>
        {TRUCK_DOC_LIST.map((doc) => (
          <span key={doc} style={{
            fontSize: 9, padding: "1px 5px", borderRadius: 4, fontWeight: 600,
            background: truck.docs?.[doc] ? "#dcfce7" : "var(--bg-raised)",
            color: truck.docs?.[doc] ? "#16a34a" : "var(--text-disabled)",
            border: `1px solid ${truck.docs?.[doc] ? "#86efac" : "var(--border)"}`,
            whiteSpace: "nowrap",
          }}>
            {doc.split(" ")[0]}
          </span>
        ))}
        <span style={{ fontSize: 10, color: "var(--text-faint)", marginLeft: 2, alignSelf: "center" }}>
          {docsCount}/{TRUCK_DOC_LIST.length}
        </span>
      </div>

      {/* Status note */}
      {truck.statusNote && (
        <div style={{ fontSize: 11, color: "var(--text-muted)", fontStyle: "italic", marginTop: 2 }}>
          {truck.statusNote}
        </div>
      )}
    </div>
  );
}

export default function TrucksView() {
  const { trucks, addTruck, updateTruck, deleteTruck, assignDriver, unassignDriver } = useTrucksStore();
  const { drivers } = useDriversStore();

  const [selectedId, setSelectedId] = useState(null);
  const [showAdd, setShowAdd] = useState(false);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [form, setForm] = useState({
    unitNumber: "", year: "", maxWeight: "", vinNumber: "",
    truckCompany: "SKP BROKERAGE", eldId: "", status: "active",
    statusNote: "", homeLocation: "", fuelCard: "",
    lastOilChange: "", currentOdometer: "", notes: "",
  });

  function setF(key, val) { setForm((p) => ({ ...p, [key]: val })); }

  async function handleAdd() {
    if (!form.unitNumber.trim()) return;
    await addTruck(form);
    setForm({
      unitNumber: "", year: "", maxWeight: "", vinNumber: "",
      truckCompany: "SKP BROKERAGE", eldId: "", status: "active",
      statusNote: "", homeLocation: "", fuelCard: "",
      lastOilChange: "", currentOdometer: "", notes: "",
    });
    setShowAdd(false);
  }

  const selectedTruck = trucks.find((t) => t.id === selectedId) || null;

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return trucks.filter((t) => {
      if (statusFilter !== "all" && t.status !== statusFilter) return false;
      if (!q) return true;
      const driverName = t.assignedDriverId
        ? (drivers.find((d) => d.id === t.assignedDriverId)?.name || "").toLowerCase()
        : "";
      return (
        String(t.unitNumber).toLowerCase().includes(q) ||
        String(t.vinNumber).toLowerCase().includes(q) ||
        String(t.truckCompany).toLowerCase().includes(q) ||
        driverName.includes(q)
      );
    });
  }, [trucks, search, statusFilter, drivers]);

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
        <div style={{ position: "relative", flex: "0 0 240px", marginLeft: "auto" }}>
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
            }}>x</button>
          )}
        </div>

        <button
          onClick={() => setShowAdd(true)}
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
            onClick={() => setStatusFilter(s.id)}
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
          <div style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
            gap: 14,
          }}>
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
                />
              );
            })}
          </div>
        )}
      </div>

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
                  <input value={form.unitNumber} onChange={(e) => setF("unitNumber", e.target.value)} style={inputStyle} placeholder="101" />
                </div>
                <div>
                  <div style={labelStyle}>Year</div>
                  <input value={form.year} onChange={(e) => setF("year", e.target.value)} style={inputStyle} placeholder="2023" />
                </div>
                <div>
                  <div style={labelStyle}>VIN</div>
                  <input value={form.vinNumber} onChange={(e) => setF("vinNumber", e.target.value)} style={inputStyle} placeholder="1FUJGLDR5CLBF7272" />
                </div>
                <div>
                  <div style={labelStyle}>Max Weight</div>
                  <input value={form.maxWeight} onChange={(e) => setF("maxWeight", e.target.value)} style={inputStyle} placeholder="5900" />
                </div>
                <div>
                  <div style={labelStyle}>Company</div>
                  <select value={form.truckCompany} onChange={(e) => setF("truckCompany", e.target.value)} style={{ ...inputStyle, cursor: "pointer" }}>
                    {TRUCK_COMPANIES.map((c) => <option key={c}>{c}</option>)}
                  </select>
                </div>
                <div>
                  <div style={labelStyle}>ELD ID</div>
                  <input value={form.eldId} onChange={(e) => setF("eldId", e.target.value)} style={inputStyle} placeholder="EZ" />
                </div>
                <div>
                  <div style={labelStyle}>Status</div>
                  <select value={form.status} onChange={(e) => setF("status", e.target.value)} style={{ ...inputStyle, cursor: "pointer" }}>
                    {TRUCK_STATUSES.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
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
                <div style={{ gridColumn: "1 / -1" }}>
                  <div style={labelStyle}>Current Odometer (mi)</div>
                  <input type="number" value={form.currentOdometer} onChange={(e) => setF("currentOdometer", e.target.value)} style={inputStyle} placeholder="0" />
                </div>
              </div>
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
