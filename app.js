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

// ---------------- INIT AFTER DOM READY ----------------
window.addEventListener("DOMContentLoaded", () => {
  // Elements (all optional-safe)
  const netStatusEl = document.getElementById("netStatus");
  const toastEl = document.getElementById("toast");

  const dateLabelEl = document.getElementById("dateLabel");
  const promptEl = document.getElementById("prompt");

  const journalEl = document.getElementById("journal");
  const habitNameEl = document.getElementById("habitName");

  const addHabitBtn = document.getElementById("addHabit");
  const resetBtn = document.getElementById("reset");

  // ---------------- OFFLINE BADGE ----------------
  function updateNetStatus() {
    if (!netStatusEl) return;

    if (navigator.onLine) {
      netStatusEl.style.display = "none";
    } else {
      netStatusEl.textContent = "Offline";
      netStatusEl.style.display = "inline-block";
    }
  }

  // ---------------- OFFLINE TOAST ----------------
  let toastTimer = null;

  function showToast(message, kind = "") {
    if (!toastEl) return;

    toastEl.textContent = message;
    toastEl.className = "toast"; // reset classes
    if (kind) toastEl.classList.add(kind);

    toastEl.classList.add("show");

    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      toastEl.classList.remove("show");
    }, 2600);
  }

  window.addEventListener("online", () => {
    updateNetStatus();
  });

  window.addEventListener("offline", () => {
    updateNetStatus();
    showToast("You’re offline — everything will still save on this device.", "offline");
  });

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
  if (dateLabelEl) dateLabelEl.textContent = todayKey;

  const dayNum = new Date().getDate();
  if (promptEl) promptEl.textContent = prompts[dayNum % prompts.length];

  // ---------------- TABS ----------------
  document.querySelectorAll(".tab").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".tab").forEach((b) => {
        b.classList.remove("active");
        b.setAttribute("aria-selected", "false");
      });
      btn.classList.add("active");
      btn.setAttribute("aria-selected", "true");

      document.querySelectorAll(".panel").forEach((p) =>
        p.classList.remove("active")
      );

      const target = document.getElementById(`tab-${btn.dataset.tab}`);
      if (target) target.classList.add("active");
    });
  });

  // ---------------- JOURNAL ----------------
  if (journalEl) {
    journalEl.value = getLog(todayKey).journal;

    journalEl.addEventListener("input", () => {
      getLog(todayKey).journal = journalEl.value;
      saveState();
    });
  }

  // ---------------- ADD HABIT ----------------
  if (addHabitBtn && habitNameEl) {
    addHabitBtn.addEventListener("click", () => {
      const name = habitNameEl.value.trim();
      if (!name) return;

      state.habits.push({ id: uid(), name, createdAt: Date.now() });
      habitNameEl.value = "";

      saveState();
      renderToday();
      renderHabits();
    });

    habitNameEl.addEventListener("keydown", (e) => {
      if (e.key === "Enter") addHabitBtn.click();
    });
  }

  // ---------------- RESET ----------------
  if (resetBtn) {
    resetBtn.addEventListener("click", () => {
      if (!confirm("Reset all data on this device?")) return;
      localStorage.removeItem(STORAGE_KEY);
      location.reload();
    });
  }

  // ---------------- VERSION LABELS (SETTINGS) ----------------
  async function setVersionLabels() {
    const buildEl = document.getElementById("buildDate");
    if (buildEl) buildEl.textContent = new Date().toISOString().slice(0, 10);

    const verEl = document.getElementById("appVersion");
    try {
      const res = await fetch("./manifest.webmanifest", { cache: "no-store" });
      const manifest = await res.json();
      if (verEl) verEl.textContent = manifest.version || "—";
    } catch {
      if (verEl) verEl.textContent = "—";
    }

    const cacheEl = document.getElementById("cacheVersion");
    if (!cacheEl) return;

    if ("serviceWorker" in navigator && navigator.serviceWorker.controller) {
      const channel = new MessageChannel();
      channel.port1.onmessage = (event) => {
        cacheEl.textContent = event.data?.cacheVersion || "—";
      };
      navigator.serviceWorker.controller.postMessage(
        { type: "GET_CACHE_VERSION" },
        [channel.port2]
      );
    } else {
      cacheEl.textContent = "—";
    }
  }

  // ---------------- RENDER: TODAY ----------------
  function renderToday() {
    const list = document.getElementById("todayHabits");
    if (!list) return;
    list.innerHTML = "";

    const empty = document.getElementById("todayEmpty");
    if (empty) empty.classList.toggle("hidden", state.habits.length !== 0);

    state.habits.forEach((h) => {
      const done = isCompletedToday(h.id);
      const streak = streakFor(h.id);

      const item = document.createElement("div");
      item.className = "item";

      const left = document.createElement("div");
      left.className = "left";

      const check = document.createElement("div");
      check.className = "check" + (done ? " done" : "");
      check.textContent = done ? "✓" : "";

      const textWrap = document.createElement("div");
      const name = document.createElement("div");
      name.className = "name";
      name.textContent = h.name;

      const meta = document.createElement("div");
      meta.className = "meta";
      meta.textContent = streak > 0 ? `${streak}-day streak` : "No streak yet";

      textWrap.append(name, meta);
      left.append(check, textWrap);

      const btn = document.createElement("button");
      btn.className = "iconBtn";
      btn.textContent = done ? "Undo" : "Done";
      btn.addEventListener("click", () => toggleCompletedToday(h.id));

      item.append(left, btn);
      list.append(item);
    });
  }

  // ---------------- RENDER: HABITS ----------------
  function renderHabits() {
    const list = document.getElementById("habitsList");
    if (!list) return;
    list.innerHTML = "";

    const empty = document.getElementById("habitsEmpty");
    if (empty) empty.classList.toggle("hidden", state.habits.length !== 0);

    state.habits.forEach((h) => {
      const item = document.createElement("div");
      item.className = "item";

      const left = document.createElement("div");
      left.className = "left";

      const dot = document.createElement("div");
      dot.className = "check";

      const textWrap = document.createElement("div");
      const name = document.createElement("div");
      name.className = "name";
      name.textContent = h.name;

      const meta = document.createElement("div");
      meta.className = "meta";
      meta.textContent = `Streak: ${streakFor(h.id)}`;

      textWrap.append(name, meta);
      left.append(dot, textWrap);

      const del = document.createElement("button");
      del.className = "iconBtn";
      del.textContent = "Delete";
      del.addEventListener("click", () => {
        if (!confirm(`Delete habit: "${h.name}"?`)) return;

        state.habits = state.habits.filter((x) => x.id !== h.id);
        Object.keys(state.logs).forEach((k) => {
          state.logs[k].completed = (state.logs[k].completed || []).filter(
            (id) => id !== h.id
          );
        });

        saveState();
        renderToday();
        renderHabits();
      });

      item.append(left, del);
      list.append(item);
    });
  }

  // ---------------- INIT ----------------
  updateNetStatus();
  setVersionLabels();
  renderToday();
  renderHabits();
});
