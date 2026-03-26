export const DISPATCHER_STAGES = [
  { id: "new_lead",   label: "New Lead",               color: "#6366f1", light: "#eef2ff" },
  { id: "no_answer",  label: "No Answer",               color: "#94a3b8", light: "#f1f5f9" },
  { id: "interview",  label: "Interview Scheduled",     color: "#10b981", light: "#ecfdf5" },
  { id: "rejected",   label: "Rejected",                color: "#ef4444", light: "#fef2f2" },
];

export const DISPATCHER_ROLES = ["HR", "Tracker", "Dispatcher", "Fleet"];

export const ENGLISH_LEVELS = ["A1", "A2", "B1", "B2", "C1", "C2"];

export const ENGLISH_COLORS = {
  A1: { bg: "#fef2f2", color: "#dc2626", border: "#fecaca" },
  A2: { bg: "#fff7ed", color: "#ea580c", border: "#fed7aa" },
  B1: { bg: "#fefce8", color: "#ca8a04", border: "#fde68a" },
  B2: { bg: "#f0fdf4", color: "#16a34a", border: "#bbf7d0" },
  C1: { bg: "#eff6ff", color: "#2563eb", border: "#bfdbfe" },
  C2: { bg: "#f5f3ff", color: "#7c3aed", border: "#ddd6fe" },
};

export const ROLE_COLORS = {
  HR:          { bg: "#eff6ff", color: "#2563eb", border: "#bfdbfe" },
  Tracker:     { bg: "#f0fdf4", color: "#16a34a", border: "#bbf7d0" },
  Dispatcher:  { bg: "#fdf4ff", color: "#9333ea", border: "#e9d5ff" },
  Fleet:       { bg: "#fff7ed", color: "#ea580c", border: "#fed7aa" },
};
