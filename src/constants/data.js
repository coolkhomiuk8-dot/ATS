export const FONT_URL = "https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&display=swap";

export const STAGES = [
  { id: "new",             label: "New Lead",                                    color: "#6366f1", light: "#eef2ff" },
  { id: "call1",           label: "First call + SMS",                            color: "#3b82f6", light: "#eff6ff" },
  { id: "call2",           label: "Second call + SMS",                           color: "#60a5fa", light: "#dbeafe" },
  { id: "call3",           label: "Third call + SMS",                            color: "#818cf8", light: "#e0e7ff" },
  { id: "video_sent",      label: "Video Sent",                                  color: "#a855f7", light: "#f3e8ff" },
  { id: "trash",           label: "Trash / Cold",                                color: "#94a3b8", light: "#f1f5f9" },
  { id: "ppw",             label: "Waiting for PPW",                             color: "#f59e0b", light: "#fffbeb" },
  { id: "beenverified",    label: "BeenVerified Checked",                        color: "#f97316", light: "#fff7ed" },
  { id: "videocall",       label: "Videocall planned",                           color: "#06b6d4", light: "#ecfeff" },
  { id: "offer_sent",      label: "Offer Sent",                                  color: "#10b981", light: "#ecfdf5" },
  { id: "offer_accepted",  label: "Offer Accepted",                              color: "#059669", light: "#d1fae5" },
  { id: "drug_test",       label: "Pre-employment Drug Test (waiting result)",   color: "#eab308", light: "#fefce8" },
  { id: "set_date",        label: "Need to set up date to arrive yard",          color: "#14b8a6", light: "#f0fdfa" },
  { id: "yard",            label: "Waiting at the yard",                         color: "#0ea5e9", light: "#f0f9ff" },
  { id: "hired",           label: "Hired",                                       color: "#16a34a", light: "#f0fdf4" },
  { id: "fired",           label: "Fired",                                       color: "#ef4444", light: "#fef2f2" },
];

export const DOC_LIST = [
  "CDL Copy",
  "MVR Report",
  "PSP Report",
  "Drug Test Consent",
  "Employment Application",
  "Prev. Employment Verification",
  "Medical Certificate (DOT)",
  "SSN / Work Authorization",
  "Background Check",
];

export const SOURCES = ["Indeed", "CDLjobs", "Referral", "LinkedIn", "Cold Call", "Other"];

export const TEXT_TEMPLATES = [
  {
    label: "First Contact",
    body: "Hi [NAME], this is [RECRUITER] from [COMPANY]. I saw your profile on [SOURCE] - we're hiring Class A CDL drivers in [REGION]. Pay is [RANGE]. Available for a quick 5-min call today?",
  },
  {
    label: "No Answer Follow-up",
    body: "Hey [NAME], tried reaching you - [RECRUITER] from [COMPANY]. We have an opening matching your experience. Reply YES and I'll send details, or call me at [PHONE].",
  },
  {
    label: "App Reminder",
    body: "Hi [NAME], [RECRUITER] here. Did you get a chance to start the application? Here's the link again: [LINK]. Let me know if you have questions!",
  },
  {
    label: "Docs Reminder",
    body: "Hi [NAME], we're almost done with your file! We just need [MISSING DOC]. Can you send it to [EMAIL] today so we can move forward?",
  },
  {
    label: "Offer Follow-up",
    body: "Hi [NAME], following up on our offer. We'd love to have you on the team! Any questions I can answer? Looking to get paperwork started this week.",
  },
  {
    label: "Re-engage Cold",
    body: "Hi [NAME], [RECRUITER] from [COMPANY] - we spoke a few weeks back. We have a new opening that might be a better fit. Still looking? Takes 2 min to chat.",
  },
];

export const CALL_LOG_TPL = `Date/Time: [DATE] [TIME]\nType: [Call / Text / Email / Voicemail]\nDuration: [X min]   Spoke To: [Yes / No]\n------------------------------\nSUMMARY:\n[What was discussed]\n\nKEY POINTS:\n- CDL Class:            - Experience:\n- Available:            - Interest: [Hot/Warm/Cold]\n- Objections:\n\nNEXT ACTION: [What + When]`;

export const FLAGS_OPT = [
  { label: "Good Experience",          type: "green" },
  { label: "Good impression",          type: "green" },
  { label: "Referral (priority)",      type: "green" },
  { label: "Do not answer, ignores calls", type: "red" },
  { label: "Bad Criminal record",      type: "red" },
  { label: "Ghosted",                  type: "red" },
];
