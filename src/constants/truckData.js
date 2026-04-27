export const TRUCK_COMPANIES = ["SKP BROKERAGE", "SKP LEASING", "CAPITAL TRUCKS", "Other"];

export const TRUCK_STATUSES = [
  { id: "active",      label: "Active",      color: "#16a34a", bg: "#f0fdf4" },
  { id: "maintenance", label: "Maintenance", color: "#dc2626", bg: "#fef2f2" },
  { id: "available",   label: "Available",   color: "#2563eb", bg: "#eff6ff" },
  { id: "inactive",    label: "Inactive",    color: "#64748b", bg: "#f8fafc" },
];

// Documents that travel with the TRUCK
export const TRUCK_DOC_LIST = [
  "Plates",
  "Registration",
  "VIN Picture",
];

// Documents that travel with the DRIVER
export const DRIVER_DOC_LIST = [
  "Driver License",
  "MVR",
  "Criminal Record",
];

export const OIL_CHANGE_INTERVAL = 6000;
// Warning thresholds (miles left until oil change)
export const OIL_WARN_SOON = 1000;   // yellow — ~1000 mi left
export const OIL_WARN_URGENT = 500;  // orange — less than 500 mi left
