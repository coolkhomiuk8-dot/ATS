// Recruiter roster for driver-lead assignment.
//
// Keep this list short — for a small team it's far simpler than a Firestore
// collection and works fine. Adding a recruiter is one line; the rest of the
// app picks them up automatically (filter chips, badges, drawer dropdown,
// daily digest split).
//
// `email` MUST be lowercased and match exactly what Firebase Auth reports
// for that user (auth.currentUser.email).

export const RECRUITERS = [
  {
    email:  "quotes@212expedite.com",
    name:   "Emma",
    short:  "EM",                  // 2-letter badge text
    color:  "#ea580c",             // border + text — orange-600
    bg:     "#fff7ed",             // soft fill — orange-50
    border: "#fed7aa",             // outline — orange-200
  },
  {
    email:  "expedite@212expedite.com",
    name:   "Amara",
    short:  "AM",
    color:  "#9333ea",             // purple-600
    bg:     "#faf5ff",             // purple-50
    border: "#e9d5ff",             // purple-200
  },
];

const UNASSIGNED = {
  email:  null,
  name:   "Unassigned",
  short:  "?",
  color:  "#64748b",  // slate-500
  bg:     "#f1f5f9",  // slate-100
  border: "#cbd5e1",  // slate-300
};

/**
 * Look up a recruiter by email (case-insensitive). Returns the Unassigned
 * pseudo-recruiter if email is empty / unknown. Always returns an object so
 * callers can read `.color` etc. without null checks.
 */
export function getRecruiter(email) {
  if (!email) return UNASSIGNED;
  const lower = String(email).toLowerCase();
  return RECRUITERS.find((r) => r.email === lower) || UNASSIGNED;
}

/** True if `email` is recognised as one of our recruiters. */
export function isKnownRecruiter(email) {
  if (!email) return false;
  const lower = String(email).toLowerCase();
  return RECRUITERS.some((r) => r.email === lower);
}

export { UNASSIGNED };
