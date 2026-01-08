/* Timmeloggen v1 – gymapp-liknande upplägg
   - 3 flikar: Konton, Tidsloggning, Sammanställning
   - Slots: start + stopptid + konto + text + "rast/lunch"
   - Arbetstid = summa (icke-rast) slots
   - Timljud varje timme efter att dagen startats
   - localStorage
*/

const activeDate = document.getElementById("activeDate");
let activeDayKey = todayKey();

const STORE = {
  accounts: "tl_accounts_v1",
  days: "tl_days_v1"
};

// ---------- Helpers ----------
const pad2 = (n) => String(n).padStart(2, "0");

function todayKey() {
  const d = new Date();
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function fmtHM(mins) {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${h}:${pad2(m)}`;
}

function parseTimeToMinutes(hhmm) {
  if (!hhmm || !hhmm.includes(":")) return null;
  const [h, m] = hhmm.split(":").map((x) => parseInt(x, 10));
  if (Number.isNaN(h) || Number.isNaN(m)) return null;
  return h * 60 + m;
}

function minutesToTime(mins) {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${pad2(h)}:${pad2(m)}`;
}

function nowTimeHHMM() {
  const d = new Date();
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

function setText(el, text) {
  el.textContent = text;
}

function loadJSON(key, fallback) {
  try {
    const v = localStorage.getItem(key);
    return v ? JSON.parse(v) : fallback;
  } catch {
    return fallback;
  }
}

function saveJSON(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

function uid() {
  return Math.random().toString(16).slice(2) + Date.now().toString(16);
}

function escapeHtml(s) {
  return (s ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

// ---------- Data model ----------
/*
days = {
  "YYYY-MM-DD": {
     startTs: number|null,
     endTs: number|null,
     slots: [
       { id, startMin, endMin, accountId, text, isBreak }
     ]
  }
}
accounts = [{id,name}]
*/
let accounts = loadJSON(STORE.accounts, []);
let days = loadJSON(STORE.days, {});

// ---------- DOM ----------
const todayPill = document.getElementById("todayPill");

const tabBtns = [...document.querySelectorAll(".tab")];
const panels = {
  accounts: document.getElementById("tab-accounts"),
  log: document.getElementById("tab-log"),
  history: document.getElementById("tab-history"),
};

// Accounts
const accountName = document.getElementById("accountName");
const addAccountBtn = document.getElementById("addAccountBtn");
const accountList = document.getElementById("accountList");

// Log
const startDayBtn = document.getElementById("startDayBtn");
const endDayBtn = document.getElementById("endDayBtn");
const dayStartView = document.getElementById("dayStartView");
const dayEndView = document.getElementById("dayEndView");
const breakView = document.getElementById("breakView");
const workView = document.getElementById("workView");
const chimeView = document.getElementById("chimeView");
const dayKeyView = document.getElementById("dayKeyView");

const slotStart = document.getElementById("slotStart");
const slotEnd = document.getElementById("slotEnd");
const slotAccount = document.getElementById("slotAccount");
const slotText = document.getElementById("slotText");
const slotIsBreak = document.getElementById("slotIsBreak");
const addSlotBtn = document.getElementById("addSlotBtn");

const slotList = document.getElementById("slotList");
const clearTodayBtn = document.getElementById("clearTodayBtn");
const exportCsvBtn = document.getElementById("exportCsvBtn");

// History / Sammanställning
const periodType = document.getElementById("periodType");
const periodDate = document.getElementById("periodDate");
const refreshHistoryBtn = document.getElementById("refreshHistoryBtn");
const overviewBox = document.getElementById("overviewBox");
const perAccountBox = document.getElementById("perAccountBox");
const historyList = document.getElementById("historyList");

// ---------- Tabs ----------
tabBtns.forEach((btn) => {
  btn.addEventListener("click", () => {
    tabBtns.forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    const key = btn.dataset.tab;
    Object.values(panels).forEach((p) => p.classList.remove("active"));
    panels[key].classList.add("active");
    if (key === "history") renderHistory();
  });
});

// ---------- Accounts ----------
function addAccount(name) {
  const n = (name || "").trim();
  if (!n) return alert("Skriv ett kontonamn/nummer.");
  if (accounts.some((a) => a.name.toLowerCase() === n.toLowerCase())) {
    return alert("Kontot finns redan.");
  }
  accounts.push({ id: uid(), name: n });
  saveJSON(STORE.accounts, accounts);
  renderAccounts();
  renderAccountSelect();
}

function deleteAccount(id) {
  accounts = accounts.filter((a) => a.id !== id);
  saveJSON(STORE.accounts, accounts);
  renderAccounts();
  renderAccountSelect();
}

function updateAccountName(id, newName) {
  const n = (newName || "").trim();
  if (!n) return;

  // blockera dubbletter (exakt namn, case-insensitive)
  if (accounts.some((a) => a.id !== id && a.name.toLowerCase() === n.toLowerCase())) {
    alert("Det finns redan ett konto med det namnet.");
    renderAccounts();
    return;
  }

  const a = accounts.find((x) => x.id === id);
  if (!a) return;
  a.name = n;
  saveJSON(STORE.accounts, accounts);
  renderAccountSelect();
}

function renderAccounts() {
  accountList.innerHTML = "";
  if (!accounts.length) {
    accountList.innerHTML = `
      <div class="item">
        <div class="left">
          <div class="title muted">Inga konton ännu</div>
          <div class="meta">Lägg till ett konto ovan.</div>
        </div>
      </div>`;
    return;
  }

  accounts
    .slice()
    .sort((a, b) => a.name.localeCompare(b.name, "sv"))
    .forEach((a) => {
      const el = document.createElement("div");
      el.className = "item";
      el.innerHTML = `
        <div class="left">
          <div class="title">
            <input class="account-edit" data-id="${a.id}" value="${escapeHtml(a.name)}"
                   style="width:100%; padding:8px 10px; border:1px solid var(--line); border-radius:12px;" />
          </div>
          <div class="meta">ID: ${a.id}</div>
        </div>
        <div>
          <button class="danger secondary" data-del="${a.id}">Ta bort</button>
        </div>
      `;

      el.querySelector(`[data-del="${a.id}"]`).addEventListener("click", () => {
        if (confirm(`Ta bort konto "${a.name}"?`)) deleteAccount(a.id);
      });

      el.querySelector(`.account-edit`).addEventListener("change", (e) => {
        updateAccountName(a.id, e.target.value);
      });

      accountList.appendChild(el);
    });
}

addAccountBtn.addEventListener("click", () => addAccount(accountName.value));
accountName.addEventListener("keydown", (e) => {
  if (e.key === "Enter") addAccount(accountName.value);
});

// ---------- Day / slots ----------
function getDay(key) {
  if (!days[key]) days[key] = { startTs: null, endTs: null, slots: [] };
  return days[key];
}

function saveDays() {
  saveJSON(STORE.days, days);
}

function startDay() {
  const key = todayKey();
  const d = getDay(key);
  if (d.startTs) return; // redan startad
  d.startTs = Date.now();
  d.endTs = null;
  saveDays();
  renderDay();
  startChimeLoop();
}

function endDay() {
  const key = todayKey();
  const d = getDay(key);
  if (!d.startTs) return alert("Starta dagen först.");
  d.endTs = Date.now();
  saveDays();
  renderDay();
  stopChimeLoop();
}

function addSlot() {
  const key = todayKey();
  const d = getDay(key);

  if (!d.startTs) {
    alert("Starta dagen först.");
    return;
  }

  const startMin = parseTimeToMinutes(slotStart.value);
  const endMin = parseTimeToMinutes(slotEnd.value);

  if (startMin === null || endMin === null) {
    alert("Välj både start- och stopptid.");
    return;
  }
  if (endMin <= startMin) {
    alert("Stopptid måste vara efter starttid.");
    return;
  }

  d.slots.push({
    id: uid(),
    startMin,
    endMin,
    accountId: slotAccount.value || "",
    text: (slotText.value || "").trim(),
    isBreak: !!slotIsBreak.checked
  });

  // sortera på starttid
  d.slots.sort((a, b) => a.startMin - b.startMin);

  saveDays();
  renderDay();

  slotText.value = "";
  slotIsBreak.checked = false;

  // smart default: nästa start = senaste stop
  slotStart.value = minutesToTime(endMin);
  slotEnd.value = "";
}

function deleteSlot(slotId) {
  const key = todayKey();
  const d = getDay(key);
  d.slots = d.slots.filter((s) => s.id !== slotId);
  saveDays();
  renderDay();
}

function toggleBreak(slotId) {
  const key = todayKey();
  const d = getDay(key);
  const s = d.slots.find((x) => x.id === slotId);
  if (!s) return;
  s.isBreak = !s.isBreak;
  saveDays();
  renderDay();
}

function editSlot(slotId) {
  const key = todayKey();
  const d = getDay(key);
  const s = d.slots.find((x) => x.id === slotId);
  if (!s) return;

  const currentStart = minutesToTime(s.startMin);
  const currentEnd = minutesToTime(s.endMin);

  const newStart = prompt("Ny starttid (HH:MM)", currentStart);
  if (newStart === null) return;
  const newEnd = prompt("Ny stopptid (HH:MM)", currentEnd);
  if (newEnd === null) return;

  const startMin = parseTimeToMinutes(newStart);
  const endMin = parseTimeToMinutes(newEnd);
  if (startMin === null || endMin === null || endMin <= startMin) {
    alert("Ogiltig start/stopptid.");
    return;
  }

  const newText = prompt("Ny text", s.text || "");
  if (newText === null) return;

  const currentAccName = accountNameById(s.accountId);
  const newAccName = prompt("Konto (skriv exakt namn, eller tomt)", currentAccName || "");
  if (newAccName !== null) {
    const found = accounts.find((a) => a.name.toLowerCase() === newAccName.trim().toLowerCase());
    s.accountId = found ? found.id : "";
  }

  s.startMin = startMin;
  s.endMin = endMin;
  s.text = newText.trim();

  d.slots.sort((a, b) => a.startMin - b.startMin);
  saveDays();
  renderDay();
}

function clearToday() {
  const key = todayKey();
  const d = getDay(key);
  if (!confirm("Rensa alla slots för idag?")) return;
  d.slots = [];
  saveDays();
  renderDay();
}

startDayBtn.addEventListener("click", startDay);
endDayBtn.addEventListener("click", endDay);
addSlotBtn.addEventListener("click", addSlot);
clearTodayBtn.addEventListener("click", clearToday);

// ---------- Calculations ----------
function slotDurationMin(s) {
  return Math.max(0, (s.endMin ?? 0) - (s.startMin ?? 0));
}

function dayBreakMinutes(day) {
  return (day.slots || [])
    .filter((s) => s.isBreak)
    .reduce((sum, s) => sum + slotDurationMin(s), 0);
}

function dayWorkMinutes(day) {
  return (day.slots || [])
    .filter((s) => !s.isBreak)
    .reduce((sum, s) => sum + slotDurationMin(s), 0);
}

function accountNameById(id) {
  const a = accounts.find((x) => x.id === id);
  return a ? a.name : "";
}

// ---------- Render log tab ----------
function renderAccountSelect() {
  slotAccount.innerHTML = `<option value="">(Välj konto)</option>`;
  accounts
    .slice()
    .sort((a, b) => a.name.localeCompare(b.name, "sv"))
    .forEach((a) => {
      const opt = document.createElement("option");
      opt.value = a.id;
      opt.textContent = a.name;
      slotAccount.appendChild(opt);
    });
}

function renderDay() {
  const key = todayKey();
  const d = getDay(key);

  dayKeyView.textContent = `Datum: ${key}`;
  todayPill.textContent = `Idag: ${key}`;

  setText(
    dayStartView,
    d.startTs
      ? new Date(d.startTs).toLocaleTimeString("sv-SE", { hour: "2-digit", minute: "2-digit" })
      : "—"
  );
  setText(
    dayEndView,
    d.endTs
      ? new Date(d.endTs).toLocaleTimeString("sv-SE", { hour: "2-digit", minute: "2-digit" })
      : "—"
  );

  const b = dayBreakMinutes(d);
  setText(breakView, fmtHM(b));

  const w = dayWorkMinutes(d);
  setText(workView, fmtHM(w));

  startDayBtn.disabled = !!d.startTs;
  endDayBtn.disabled = !d.startTs || !!d.endTs;

  // defaults för slot inputs
  const nowM = parseTimeToMinutes(nowTimeHHMM());
  if (nowM !== null) {
    // default start = nu (ej avrundning)
    if (!slotStart.value) slotStart.value = minutesToTime(nowM);
  }

  slotList.innerHTML = "";
  if (!d.slots.length) {
    slotList.innerHTML = `
      <div class="item">
        <div class="left">
          <div class="title muted">Inga slots ännu</div>
          <div class="meta">Lägg till en slot med start + stopptid.</div>
        </div>
      </div>`;
    return;
  }

  d.slots.forEach((s) => {
    const acc = accountNameById(s.accountId) || "(ej valt)";
    const timeLabel = `${minutesToTime(s.startMin)}–${minutesToTime(s.endMin)}`;
    const dur = fmtHM(slotDurationMin(s));
    const meta = `${timeLabel} • ${dur} • ${acc}${s.isBreak ? " • Rast/Lunch" : ""}`;

    const el = document.createElement("div");
    el.className = "item";
    el.innerHTML = `
      <div class="left">
        <div class="title">${escapeHtml(meta)}</div>
        <div class="meta">${escapeHtml(s.text || "")}</div>
      </div>
      <div class="row" style="margin:0; gap:8px;">
        <button class="secondary" data-edit="${s.id}">Ändra</button>
        <button class="secondary" data-break="${s.id}">${s.isBreak ? "Ej rast" : "Rast"}</button>
        <button class="danger secondary" data-del="${s.id}">Ta bort</button>
      </div>
    `;
    el.querySelector(`[data-del="${s.id}"]`).addEventListener("click", () => deleteSlot(s.id));
    el.querySelector(`[data-break="${s.id}"]`).addEventListener("click", () => toggleBreak(s.id));
    el.querySelector(`[data-edit="${s.id}"]`).addEventListener("click", () => editSlot(s.id));
    slotList.appendChild(el);
  });
}

// ---------- Hourly chime ----------
let chimeTimer = null;
let chimeNextTs = null;

function playChime() {
  try {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;

    const ctx = new AudioCtx();
    const gain = ctx.createGain();
    gain.gain.value = 0.06;
    gain.connect(ctx.destination);

    // Tre toner (särskiljbar signal)
    const freqs = [880, 660, 880];
    let t = ctx.currentTime;

    freqs.forEach((f) => {
      const osc = ctx.createOscillator();
      osc.type = "sine";
      osc.frequency.value = f;
      osc.connect(gain);
      osc.start(t);
      osc.stop(t + 0.18);
      t += 0.22;
    });

    setTimeout(() => ctx.close(), 1200);
  } catch {
    // ignore
  }
}

function startChimeLoop() {
  stopChimeLoop();

  const key = todayKey();
  const d = getDay(key);
  if (!d.startTs || d.endTs) {
    chimeView.textContent = "Timljud: av";
    return;
  }

  const start = d.startTs;
  chimeNextTs = start + 60 * 60 * 1000;
  chimeView.textContent = "Timljud: på (varje timme efter start)";

  chimeTimer = setInterval(() => {
    const now = Date.now();
    if (!chimeNextTs) return;
    if (now >= chimeNextTs) {
      while (now >= chimeNextTs) chimeNextTs += 60 * 60 * 1000;
      playChime();
    }
  }, 20_000);
}

function stopChimeLoop() {
  if (chimeTimer) clearInterval(chimeTimer);
  chimeTimer = null;
  chimeNextTs = null;
  chimeView.textContent = "Timljud: av";
}

// ---------- CSV export ----------
exportCsvBtn.addEventListener("click", () => {
  const rows = [];
  rows.push(["Datum", "Start", "Slut", "SlotStart", "SlotSlut", "Minuter", "Konto", "Rast", "Text"].join(";"));

  const keys = Object.keys(days).sort();
  for (const k of keys) {
    const d = days[k];
    const start = d.startTs
      ? new Date(d.startTs).toLocaleTimeString("sv-SE", { hour: "2-digit", minute: "2-digit" })
      : "";
    const end = d.endTs
      ? new Date(d.endTs).toLocaleTimeString("sv-SE", { hour: "2-digit", minute: "2-digit" })
      : "";

    if (!d.slots.length) {
      rows.push([k, start, end, "", "", "", "", "", ""].join(";"));
      continue;
    }

    d.slots.forEach((s) => {
      const acc = accountNameById(s.accountId);
      const isBreak = s.isBreak ? "1" : "0";
      const text = (s.text || "").replaceAll('"', '""');
      const mins = slotDurationMin(s);
      rows.push([
        k,
        start,
        end,
        minutesToTime(s.startMin),
        minutesToTime(s.endMin),
        mins,
        acc,
        isBreak,
        `"${text}"`
      ].join(";"));
    });
  }

  const blob = new Blob([rows.join("\n")], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `timmeloggen_export_${todayKey()}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
});

// ---------- History ----------
function isoWeekKeyFromDate(dateObj) {
  const d = new Date(Date.UTC(dateObj.getFullYear(), dateObj.getMonth(), dateObj.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
  return `${d.getUTCFullYear()}-W${pad2(weekNo)}`;
}

function monthKeyFromDate(dateObj) {
  return `${dateObj.getFullYear()}-${pad2(dateObj.getMonth() + 1)}`;
}

function dayKeyFromDate(dateObj) {
  return `${dateObj.getFullYear()}-${pad2(dateObj.getMonth() + 1)}-${pad2(dateObj.getDate())}`;
}

function periodKeys(type, dateStr) {
  const d = dateStr ? new Date(dateStr + "T12:00:00") : new Date();
  if (Number.isNaN(d.getTime())) return [];

  const keys = Object.keys(days);
  if (type === "day") {
    const k = dayKeyFromDate(d);
    return keys.filter((x) => x === k);
  }

  if (type === "month") {
    const mk = monthKeyFromDate(d);
    return keys.filter((x) => x.startsWith(mk + "-"));
  }

  const targetW = isoWeekKeyFromDate(d);
  return keys.filter((k) => {
    const kd = new Date(k + "T12:00:00");
    if (Number.isNaN(kd.getTime())) return false;
    return isoWeekKeyFromDate(kd) === targetW;
  });
}

function aggregateForKeys(keys) {
  let totalWorkMin = 0;
  let totalBreakMin = 0;
  const perAccMin = new Map();
  const rows = [];

  keys.sort().forEach((k) => {
    const day = days[k];
    const b = dayBreakMinutes(day);
    const w = dayWorkMinutes(day);

    totalBreakMin += b;
    totalWorkMin += w;

    (day.slots || []).forEach((s) => {
      rows.push({ date: k, ...s });

      const dur = slotDurationMin(s);
      if (s.isBreak) return;

      const accId = s.accountId || "";
      const prev = perAccMin.get(accId) || 0;
      perAccMin.set(accId, prev + dur);
    });
  });

  return { totalWorkMin, totalBreakMin, perAccMin, rows };
}

function renderHistory() {
  const type = periodType.value;
  const dateStr = periodDate.value || todayKey();
  if (!periodDate.value) periodDate.value = todayKey();

  const keys = periodKeys(type, dateStr);
  const { totalWorkMin, totalBreakMin, perAccMin, rows } = aggregateForKeys(keys);

  const label =
    type === "day"
      ? `Dag: ${dateStr}`
      : type === "month"
      ? `Månad: ${dateStr.slice(0, 7)}`
      : `Vecka: ${isoWeekKeyFromDate(new Date(dateStr + "T12:00:00"))}`;

  overviewBox.innerHTML = `
    <div><span class="k">Period</span> <span class="v">${label}</span></div>
    <div><span class="k">Arbetstid</span> <span class="v strong">${fmtHM(totalWorkMin)}</span></div>
    <div><span class="k">Rast/lunch</span> <span class="v">${fmtHM(totalBreakMin)}</span></div>
    <div><span class="k">Dagar med data</span> <span class="v">${keys.length}</span></div>
  `;

  // Per konto
  if (perAccMin.size === 0) {
    perAccountBox.innerHTML = `<div class="muted">Inga slots i perioden.</div>`;
  } else {
    const entries = [...perAccMin.entries()]
      .map(([accId, min]) => ({ accId, min, name: accountNameById(accId) || "(ej valt)" }))
      .sort((a, b) => b.min - a.min);

    let html = `<div class="list">`;
    entries.forEach((e) => {
      html += `
        <div class="item">
          <div class="left">
            <div class="title">${escapeHtml(e.name)}</div>
            <div class="meta">${fmtHM(e.min)}</div>
          </div>
        </div>
      `;
    });
    html += `</div>`;
    perAccountBox.innerHTML = html;
  }

  // Poster
  historyList.innerHTML = "";
  if (!rows.length) {
    historyList.innerHTML = `
      <div class="item">
        <div class="left">
          <div class="title muted">Inga poster</div>
          <div class="meta">Inget att visa i vald period.</div>
        </div>
      </div>`;
  } else {
    rows
      .slice()
      .sort((a, b) => (a.date + minutesToTime(a.startMin)).localeCompare(b.date + minutesToTime(b.startMin), "sv"))
      .forEach((r) => {
        const acc = accountNameById(r.accountId) || "(ej valt)";
        const timeLabel = `${minutesToTime(r.startMin)}–${minutesToTime(r.endMin)}`;
        const dur = fmtHM(slotDurationMin(r));
        const meta = `${r.date} • ${timeLabel} • ${dur} • ${acc}${r.isBreak ? " • Rast/Lunch" : ""}`;

        const el = document.createElement("div");
        el.className = "item";
        el.innerHTML = `
          <div class="left">
            <div class="title">${escapeHtml(meta)}</div>
            <div class="meta">${escapeHtml(r.text || "")}</div>
          </div>
        `;
        historyList.appendChild(el);
      });
  }
}

refreshHistoryBtn.addEventListener("click", renderHistory);
periodType.addEventListener("change", renderHistory);
periodDate.addEventListener("change", renderHistory);

activeDate.value = activeDayKey;
activeDate.addEventListener("change", () => {
  activeDayKey = activeDate.value || todayKey();
  renderDay();
});

// ---------- Init ----------
function init() {
  todayPill.textContent = `Idag: ${todayKey()}`;
  renderAccounts();
  renderAccountSelect();
  renderDay();

  periodDate.value = todayKey();

  const d = getDay(todayKey());
  if (d.startTs && !d.endTs) startChimeLoop();
}
init();
