/* Quiet Daily (PWA MVP)
   - Habits
   - Today completion + streaks
   - Daily journal text
   - LocalStorage persistence
*/

const STORAGE_KEY = "quiet_daily_state_v1";

const prompts = [
  "One thing that went well…",
  "Today felt like…",
  "A small win was…",
  "Something I’m proud of…",
  "One gentle goal for tomorrow…"
];

function startOfDayISO(d = new Date()) {
  const x = new Date(d);
  x.setHours(0,0,0,0);
  // Store as ISO date string like "2026-01-22"
  return x.toISOString().slice(0,10);
}

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
  return crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random().toString(16).slice(2);
}

function getLog(dayKey) {
  if (!state.logs[dayKey]) state.logs[dayKey] = { completed: [], journal: "" };
  return state.logs[dayKey];
}

function isCompletedToday(habitId) {
  const log = getLog(todayKey);
  return log.completed.includes(habitId);
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
  // Simple rule: streak counts consecutive days ending today,
  // and is 0 if not completed today.
  const logToday = getLog(todayKey);
  if (!logToday.completed.includes(habitId)) return 0;

  let streak = 0;
  let cursor = new Date(todayKey + "T00:00:00");
  while (true) {
    const key = cursor.toISOString().slice(0,10);
    const log = state.logs[key];
    if (log && log.completed.includes(habitId)) {
      streak += 1;
      cursor.setDate(cursor.getDate() - 1);
    } else {
      break;
    }
  }
  return streak;
}

// ---- UI / Rendering ----
const state = loadState();
const todayKey = startOfDayISO();
document.getElementById("dateLabel").textContent = todayKey;

const promptEl = document.getElementById("prompt");
const dayNum = new Date().getDate();
promptEl.textContent = prompts[dayNum % prompts.length];

// Tabs
document.querySelectorAll(".tab").forEach(btn => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".tab").forEach(b => {
      b.classList.remove("active");
      b.setAttribute("aria-selected", "false");
    });
    btn.classList.add("active");
    btn.setAttribute("aria-selected", "true");

    const tab = btn.dataset.tab;
    document.querySelectorAll(".panel").forEach(p => p.classList.remove("active"));
    document.getElementById(`tab-${tab}`).classList.add("active");
  });
});

// Journal
const journalEl = document.getElementById("journal");
journalEl.value = getLog(todayKey).journal || "";
journalEl.addEventListener("input", () => {
  const log = getLog(todayKey);
  log.journal = journalEl.value;
  saveState();
});

// Add habit
const habitNameEl = document.getElementById("habitName");
document.getElementById("addHabit").addEventListener("click", () => {
  const name = habitNameEl.value.trim();
  if (!name) return;
  state.habits.push({ id: uid(), name, createdAt: Date.now() });
  habitNameEl.value = "";
  saveState();
  renderToday();
  renderHabits();
});
habitNameEl.addEventListener("keydown", (e) => {
  if (e.key === "Enter") document.getElementById("addHabit").click();
});

// Reset
document.getElementById("reset").addEventListener("click", () => {
  const ok = confirm("Reset all data on this device?");
  if (!ok) return;
  localStorage.removeItem(STORAGE_KEY);
  location.reload();
});

function renderToday() {
  const list = document.getElementById("todayHabits");
  list.innerHTML = "";

  const empty = document.getElementById("todayEmpty");
  empty.classList.toggle("hidden", state.habits.length !== 0);

  state.habits.forEach(h => {
    const done = isCompletedToday(h.id);
    const streak = streakFor(h.id);

    const item = document.createElement("div");
    item.className = "item";

    const left = document.createElement("div");
    left.className = "left";

    const check = document.createElement("div");
    check.className = "check" + (done ? " done" : "");
    check.textContent = done ? "✓" : "";
    check.setAttribute("aria-label", done ? "Completed" : "Not completed");

    const textWrap = document.createElement("div");
    const name = document.createElement("div");
    name.className = "name";
    name.textContent = h.name;

    const meta = document.createElement("div");
    meta.className = "meta";
    meta.textContent = streak > 0 ? `${streak}-day streak` : "No streak yet";

    textWrap.appendChild(name);
    textWrap.appendChild(meta);

    left.appendChild(check);
    left.appendChild(textWrap);

    const btn = document.createElement("button");
    btn.className = "iconBtn";
    btn.textContent = done ? "Undo" : "Done";
    btn.addEventListener("click", () => toggleCompletedToday(h.id));

    item.appendChild(left);
    item.appendChild(btn);

    list.appendChild(item);
  });
}

function renderHabits() {
  const list = document.getElementById("habitsList");
  list.innerHTML = "";

  const empty = document.getElementById("habitsEmpty");
  empty.classList.toggle("hidden", state.habits.length !== 0);

  state.habits.forEach(h => {
    const item = document.createElement("div");
    item.className = "item";

    const left = document.createElement("div");
    left.className = "left";

    const dot = document.createElement("div");
    dot.className = "check";
    dot.textContent = "";

    const textWrap = document.createElement("div");
    const name = document.createElement("div");
    name.className = "name";
    name.textContent = h.name;

    const meta = document.createElement("div");
    meta.className = "meta";
    meta.textContent = `Streak: ${streakFor(h.id)}`;

    textWrap.appendChild(name);
    textWrap.appendChild(meta);

    left.appendChild(dot);
    left.appendChild(textWrap);

    const del = document.createElement("button");
    del.className = "iconBtn";
    del.textContent = "Delete";
    del.addEventListener("click", () => {
      const ok = confirm(`Delete habit: "${h.name}"?`);
      if (!ok) return;

      state.habits = state.habits.filter(x => x.id !== h.id);
      // remove completion refs
      Object.keys(state.logs).forEach(k => {
        state.logs[k].completed = (state.logs[k].completed || []).filter(id => id !== h.id);
      });
      saveState();
      renderToday();
      renderHabits();
    });

    item.appendChild(left);
    item.appendChild(del);
    list.appendChild(item);
  });
}

renderToday();
renderHabits();
