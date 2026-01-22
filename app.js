/* Quiet Daily (PWA MVP)
   - Habits
   - Today completion + streaks
   - Daily journal text
   - LocalStorage persistence
   - Offline-only status badge
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
    return { habits: [], logs: {} };
  }
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function uid() {
  return crypto.randomUUID
    ? crypto.randomUUID()
    : Date.now().toString(36) + Math.random().toString(36).slice(2);
}

const state = loadState();
const todayKey = startOfDayISO();

// ---------------- ONLINE / OFFLINE INDICATOR ----------------
const netStatusEl = document.getElementById("netStatus");

function updateNetStatus() {
  if (!netStatusEl) return;

  if (navigator.onLine) {
    netStatusEl.style.display = "none";
  } else {
    netStatusEl.textContent = "Offline";
    netStatusEl.style.display = "inline-block";
  }
}

window.addEventListener("online", updateNetStatus);
window.addEventListener("offline", updateNetStatus);

// ---------------- LOG HELPERS ----------------
function getLog(dayKey) {
  if (!state.logs[dayKey]) {
    state.logs[dayKey] = { completed: [], journal: "" };
  }
  return state.logs[dayKey];
}

function isCompletedToday(habitId) {
  return getLog(todayKey).completed.includes(habitId);
}

function toggleCompletedToday(habitId) {
  const log = getLog(todayKey);
  const idx = log.completed.indexOf(habitId);

  if (idx >= 0) log.completed.splice(idx, 1);
  else log.completed.push(habitId);

  saveState();
  renderToday();
  renderHabits();
}

function streakFor(habitId) {
  const logToday = getLog(todayKey);
  if (!logToday.completed.includes(habitId)) return 0;

  let streak = 0;
  let cursor = new Date(todayKey + "T00:00:00");

  while (true) {
    const key = cursor.toISOString().slice(0, 10);
    const log = state.logs[key];
    if (log && log.completed.includes(habitId)) {
      streak++;
      cursor.setDate(cursor.getDate() - 1);
    } else break;
  }

  return streak;
}

// ---------------- HEADER / PROMPT ----------------
document.getElementById("dateLabel").textContent = todayKey;

const dayNum = new Date().getDate();
document.getElementById
