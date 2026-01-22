/* Quiet Daily (PWA MVP)
   Features:
   - Habits with daily completion
   - Simple streaks
   - Daily journal (autosaved)
   - LocalStorage persistence
   - Offline-only badge
   - Soft offline toast
   - Version / cache / build labels (Settings)
*/

const STORAGE_KEY = "quiet_daily_state_v1";

// ---------------- PROMPTS ----------------
const prompts = [
  "One thing that went well…",
  "Today felt like…",
  "A small win was…",
  "Something I’m proud of…",
  "One gentle goal for tomorrow…"
];

// ---------------- DATE HELPERS ----------------
function startOfDayISO(d = new Date()) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x.toISOString().slice(0, 10); // YYYY-MM-DD
}

// ---------------- STATE ----------------
function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { habits: [], logs: {} };
    const parsed = JSON.parse(raw);
    if (!parsed.habits || !parsed.logs) return { habits: [], logs: {} };
    return parsed;
  } catch {
    return { habits: [],
