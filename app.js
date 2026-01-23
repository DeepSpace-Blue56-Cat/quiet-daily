/* Quiet Daily (PWA MVP)
   Features:
   - Habits with daily completion
   - Simple streaks
   - Daily journal (autosaved)
   - LocalStorage persistence
   - Offline-only badge
   - Soft offline toast
   - Version / cache / build labels (Settings)
   - Weekly history (This week / Last week selector)
   - Export / Import backup (.json)
   - Reorder habits (Up / Down)
   - Weekly targets (1–7/week) + progress bars
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
function isoToDate(iso) {
  return new Date(iso + "T00:00:00");
}
function addDays(date, delta) {
  const d = new Date(date);
  d.setDate(d.getDate() + delta);
  return d;
}
function startOfWeekISO(date = new Date()) {
  // Monday-start week: Monday = 0 ... Sunday = 6
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  const day = d.getDay(); // Sun=0..Sat=6
  const mondayIndex = (day + 6) % 7; // Mon=0, Tue=1 ... Sun=6
  d.setDate(d.getDate() - mondayIndex);
  return startOfDayISO(d);
}
function clampInt(n, min, max, fallback) {
  const x = Number(n);
  if (!Number.isFinite(x)) return fallback;
  const y = Math.round(x);
  return Math.min(max, Math.max(min, y));
}

// ---------------- STATE ----------------
function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { habits: [], logs: {} };
    const parsed = JSON.parse(raw);
    if (!parsed.habits || !parsed.logs) return { habits: [], logs: {} };

    // Backfill targetPerWeek for older saves
    parsed.habits = (parsed.habits || []).map(h => ({
      ...h,
      targetPerWeek: clampInt(h.targetPerWeek, 1, 7, 7)
    }));

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
  // Elements
  const netStatusEl = document.getElementById("netStatus");
  const toastEl = document.getElementById("toast");

  const dateLabelEl = document.getElementById("dateLabel");
  const promptEl = document.getElementById("prompt");

  const journalEl = document.getElementById("journal");
  const habitNameEl = document.getElementById("habitName");

  const addHabitBtn = document.getElementById("addHabit");
  const resetBtn = document.getElementById("reset");

  // Weekly elements
  const weeklyWrap = document.getElementById("weeklyWrap");
  const weeklyEmpty = document.getElementById("weeklyEmpty");
  const weekSelect = document.getElementById("weekSelect");

  // Export/Import
  const exportBtn = document.getElementById("exportData");
  const importBtn = document.getElementById("importBtn");
  const importFile = document.getElementById("importFile");

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
    toastEl.className = "toast";
    if (kind) toastEl.classList.add(kind);

    toastEl.classList.add("show");

    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      toastEl.classList.remove("show");
    }, 2600);
  }

  window.addEventListener("online", () => updateNetStatus());
  window.addEventListener("offline", () => {
    updateNetStatus();
    showToast("You’re offline — everything will still save on this device.", "offline");
  });

  // ---------------- LOG HELPERS ----------------
  function getLog(dayKey) {
    if (!state.logs[dayKey]) state.logs[dayKey] = { completed: [], journal: "" };
    return state.logs[dayKey];
  }

  function isCompletedOnDay(dayKey, habitId) {
    return getLog(dayKey).completed.includes(habitId);
  }

  function toggleCompletedForDay(dayKey, habitId) {
    const log = getLog(dayKey);
    const has = log.completed.includes(habitId);
    if (has) log.completed = log.completed.filter((id) => id !== habitId);
    else log.completed.push(habitId);

    saveState();
    renderToday();
    renderHabits();
    renderWeekly();
  }

  function isCompletedToday(habitId) {
    return isCompletedOnDay(todayKey, habitId);
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

  // ---------------- REORDER HABITS ----------------
  function moveHabit(habitId, direction) {
    const idx = state.habits.findIndex((h) => h.id === habitId);
    if (idx < 0) return;

    const newIdx = idx + direction;
    if (newIdx < 0 || newIdx >= state.habits.length) return;

    const [item] = state.habits.splice(idx, 1);
    state.habits.splice(newIdx, 0, item);

    saveState();
    renderToday();
    renderHabits();
    renderWeekly();
  }

  // ---------------- TARGETS ----------------
  function setTarget(habitId, targetPerWeek) {
    const h = state.habits.find(x => x.id === habitId);
    if (!h) return;
    h.targetPerWeek = clampInt(targetPerWeek, 1, 7, 7);
    saveState();
    renderHabits();
    renderWeekly();
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

      document.querySelectorAll(".panel").forEach((p) => p.classList.remove("active"));
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

      state.habits.push({
        id: uid(),
        name,
        createdAt: Date.now(),
        targetPerWeek: 7 // default target
      });

      habitNameEl.value = "";
      saveState();
      renderToday();
      renderHabits();
      renderWeekly();
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

  // ---------------- WEEK SELECTOR ----------------
  let weekOffset = 0; // 0 = this week, 1 = last week
  if (weekSelect) {
    weekSelect.value = "0";
    weekSelect.addEventListener("change", () => {
      weekOffset = Number(weekSelect.value) || 0;
      renderWeekly();
    });
  }

  // ---------------- EXPORT / IMPORT (SETTINGS) ----------------
  function downloadTextFile(filename, text) {
    const blob = new Blob([text], { type: "application/json" });
    const url = URL.createObjectURL(blob);

    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();

    URL.revokeObjectURL(url);
  }

  function sanitizeImportedState(obj) {
    if (!obj || typeof obj !== "object") return null;

    const habits = Array.isArray(obj.habits) ? obj.habits : [];
    const logs = obj.logs && typeof obj.logs === "object" ? obj.logs : {};

    const cleanHabits = habits
      .filter(h => h && typeof h === "object" && typeof h.name === "string")
      .map(h => ({
        id: typeof h.id === "string" ? h.id : uid(),
        name: h.name.trim().slice(0, 40),
        createdAt: typeof h.createdAt === "number" ? h.createdAt : Date.now(),
        targetPerWeek: clampInt(h.targetPerWeek, 1, 7, 7)
      }))
      .filter(h => h.name.length > 0);

    const cleanLogs = {};
    for (const [dayKey, log] of Object.entries(logs)) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(dayKey)) continue;
      if (!log || typeof log !== "object") continue;

      const completed = Array.isArray(log.completed)
        ? log.completed.filter(x => typeof x === "string")
        : [];
      const journal = typeof log.journal === "string" ? log.journal : "";

      cleanLogs[dayKey] = {
        completed: Array.from(new Set(completed)),
        journal
      };
    }

    return { habits: cleanHabits, logs: cleanLogs };
  }

  if (exportBtn) {
    exportBtn.addEventListener("click", () => {
      const payload = {
        exportedAt: new Date().toISOString(),
        app: "Quiet Daily",
        data: state
      };
      const filename = `quiet-daily-backup-${startOfDayISO(new Date())}.json`;
      downloadTextFile(filename, JSON.stringify(payload, null, 2));
      showToast("Backup exported.");
    });
  }

  if (importBtn && importFile) {
    importBtn.addEventListener("click", () => {
      importFile.value = "";
      importFile.click();
    });

    importFile.addEventListener("change", async () => {
      const file = importFile.files && importFile.files[0];
      if (!file) return;

      try {
        const text = await file.text();
        const parsed = JSON.parse(text);
        const incoming = parsed && parsed.data ? parsed.data : parsed;

        const clean = sanitizeImportedState(incoming);
        if (!clean) throw new Error("Invalid file");

        state.habits = clean.habits;
        state.logs = clean.logs;

        saveState();
        renderToday();
        renderHabits();
        renderWeekly();
        setVersionLabels();

        showToast("Backup imported.");
      } catch (err) {
        console.error(err);
        showToast("Import failed — please choose a valid Quiet Daily backup.", "offline");
      }
    });
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
      btn.addEventListener("click", () => toggleCompletedForDay(todayKey, h.id));

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

    state.habits.forEach((h, index) => {
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
      const target = clampInt(h.targetPerWeek, 1, 7, 7);
      meta.textContent = `Target: ${target}/week • Streak: ${streakFor(h.id)}`;

      textWrap.append(name, meta);
      left.append(dot, textWrap);

      // Controls row
      const controls = document.createElement("div");
      controls.style.display = "flex";
      controls.style.gap = "8px";
      controls.style.alignItems = "center";

      // Target select (1..7)
      const sel = document.createElement("select");
      sel.className = "iconBtn";
      sel.setAttribute("aria-label", `Set target for "${h.name}"`);
      for (let i = 1; i <= 7; i++) {
        const opt = document.createElement("option");
        opt.value = String(i);
        opt.textContent = `${i}/wk`;
        sel.append(opt);
      }
      sel.value = String(target);
      sel.addEventListener("change", () => setTarget(h.id, sel.value));

      // Up / Down
      const up = document.createElement("button");
      up.className = "iconBtn";
      up.textContent = "↑";
      up.disabled = index === 0;
      up.setAttribute("aria-label", `Move "${h.name}" up`);
      up.addEventListener("click", () => moveHabit(h.id, -1));

      const down = document.createElement("button");
      down.className = "iconBtn";
      down.textContent = "↓";
      down.disabled = index === state.habits.length - 1;
      down.setAttribute("aria-label", `Move "${h.name}" down`);
      down.addEventListener("click", () => moveHabit(h.id, 1));

      // Delete
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
        renderWeekly();
      });

      controls.append(sel, up, down, del);

      item.append(left, controls);
      list.append(item);
    });
  }

  // ---------------- RENDER: WEEKLY ----------------
  function renderWeekly() {
    if (!weeklyWrap || !weeklyEmpty) return;

    weeklyWrap.innerHTML = "";
    weeklyEmpty.classList.toggle("hidden", state.habits.length !== 0);
    if (state.habits.length === 0) return;

    const base = addDays(new Date(), -7 * weekOffset);
    const weekStartISO = startOfWeekISO(base);
    const weekStartDate = isoToDate(weekStartISO);

    const labels = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

    state.habits.forEach((h) => {
      const row = document.createElement("div");
      row.className = "weekRow";

      const top = document.createElement("div");
      top.className = "weekTop";

      const name = document.createElement("div");
      name.className = "weekName";
      name.textContent = h.name;

      let count = 0;
      for (let i = 0; i < 7; i++) {
        const dayKey = startOfDayISO(addDays(weekStartDate, i));
        if (isCompletedOnDay(dayKey, h.id)) count++;
      }

      const target = clampInt(h.targetPerWeek, 1, 7, 7);
      const pct = Math.min(100, Math.round((count / target) * 100));

      const meta = document.createElement("div");
      meta.className = "weekMeta";
      meta.textContent = `${count}/${target}`;

      top.append(name, meta);

      // Progress bar
      const bar = document.createElement("div");
      bar.className = "progressBar";

      const fill = document.createElement("div");
      fill.className = "progressFill";
      fill.style.width = `${pct}%`;

      bar.append(fill);

      const grid = document.createElement("div");
      grid.className = "weekGrid";

      for (let i = 0; i < 7; i++) {
        const dayDate = addDays(weekStartDate, i);
        const dayKey = startOfDayISO(dayDate);
        const done = isCompletedOnDay(dayKey, h.id);

        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "dayBtn" + (done ? " done" : "");
        btn.setAttribute(
          "aria-label",
          `${h.name} ${labels[i]} ${done ? "completed" : "not completed"}`
        );

        const lab = document.createElement("div");
        lab.className = "dayLabel";
        lab.textContent = labels[i];

        const dot = document.createElement("div");
        dot.className = "dayDot";

        btn.append(lab, dot);
        btn.addEventListener("click", () => toggleCompletedForDay(dayKey, h.id));
        grid.append(btn);
      }

      row.append(top, bar, grid);
      weeklyWrap.append(row);
    });
  }

  // ---------------- INIT ----------------
  updateNetStatus();
  setVersionLabels();
  renderToday();
  renderHabits();
  renderWeekly();
});
