/* Time Ledger
   - 3 flikar: Konton, Tidsloggning, Sammanställning
   - Slots: start + stopptid + konto + text + "rast/lunch"
   - Arbetstid = summa (icke-rast) slots (alla dagar)
   - Start/Slut + timljud: endast för idag
   - localStorage
*/


const STORE = {
  accounts: "tl_accounts_v1",
  days: "tl_days_v1",
};
function getInvoiceNo(){
  return "26-001";
}

// ---------- Helpers ----------
const pad2 = (n) => String(n).padStart(2, "0");

function todayKey() {
  const d = new Date();
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

const TL_KEYS = ["tl_days_v1", "tl_accounts_v1", "tl_underlag_payload_v1"];

function fmtHM(mins) {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${h}:${pad2(m)}`;
}

function parseTimeToMinutes(hhmm) {
  if (!hhmm || !hhmm.includes(":")) return null;
  const [h, m] = hhmm.split(":").map((x) => parseInt(x, 10));
  if (Number.isNaN(h) || Number.isNaN(m)) return null;
  if (h < 0 || h > 23 || m < 0 || m > 59) return null;
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
  if (el) el.textContent = text;
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
function monthKeyFromDayKey(dayKey){
  // "YYYY-MM-DD" -> "YYYY-MM"
  return dayKey.slice(0,7);
}

function minutesToDecimalHours(mins){
  // 150 -> 2.5
  return Math.round((mins / 60) * 100) / 100;
}

function formatHoursSv(hours){
  // 2.5 -> "2,50"
  const s = hours.toFixed(2);
  return s.replace(".", ",");
}

function formatDateSv(dayKey){
  // "2026-01-03" -> "2026-01-03" (du kan byta till "3/1" om du vill senare)
  return dayKey;
}

const DAILY_BUDGET_HOURS = 3.2;

function isWeekday(dateObj){
  const d = dateObj.getDay(); // 0=sön ... 6=lör
  return d >= 1 && d <= 5;
}

function monthBounds(yyyyMm){
  const [y, m] = yyyyMm.split("-").map(Number);
  const start = new Date(y, m - 1, 1);
  const end = new Date(y, m, 0); // sista dagen i månaden
  return { start, end };
}

function countWeekdaysInRange(startDate, endDateInclusive){
  let count = 0;
  const d = new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate());
  const end = new Date(endDateInclusive.getFullYear(), endDateInclusive.getMonth(), endDateInclusive.getDate());
  while (d <= end){
    if (isWeekday(d)) count++;
    d.setDate(d.getDate() + 1);
  }
  return count;
}

function hoursWorkedInMonth(daysObj, yyyyMm){
  const dayKeys = Object.keys(daysObj || {}).filter(k => k.startsWith(yyyyMm + "-"));
  let minutes = 0;

  for (const k of dayKeys){
    const d = daysObj[k];
    const slots = Array.isArray(d?.slots) ? d.slots : [];
    for (const s of slots){
      const isBreak = !!(s?.isBreak ?? s?.break ?? s?.isPause);
      if (isBreak) continue;

      const a = Number(s?.startMin);
      const b = Number(s?.endMin);
      if (!Number.isFinite(a) || !Number.isFinite(b) || b <= a) continue;

      minutes += (b - a);
    }
  }
  return minutes / 60;
}

function monthForecast(daysObj, yyyyMm){
  const { start, end } = monthBounds(yyyyMm);

  const workdaysInMonth = countWeekdaysInRange(start, end);

  const today = new Date();
  const isCurrentMonth =
    today.getFullYear() === start.getFullYear() &&
    today.getMonth() === start.getMonth();

  const elapsedEnd = isCurrentMonth ? today : end;
  const elapsedWorkdays = countWeekdaysInRange(start, elapsedEnd);

  const budgetMonth = workdaysInMonth * DAILY_BUDGET_HOURS;
  const budgetSoFar = elapsedWorkdays * DAILY_BUDGET_HOURS;

  const workedSoFar = hoursWorkedInMonth(daysObj, yyyyMm);

  const remainingWorkdays = Math.max(0, workdaysInMonth - elapsedWorkdays);
  const budgetRemaining = Math.max(0, budgetMonth - workedSoFar);

  // Prognos om du fortsätter i budget-takt resten av månaden:
  const forecast = workedSoFar + remainingWorkdays * DAILY_BUDGET_HOURS;
  const forecastDelta = forecast - budgetMonth;

  // Krävs för att nå exakt budget (om du vill "komma ikapp"):
  const requiredPerDayToReachBudget =
    remainingWorkdays > 0 ? budgetRemaining / remainingWorkdays : 0;

  return {
    workdaysInMonth,
    elapsedWorkdays,
    remainingWorkdays,

    budgetMonth,
    budgetSoFar,
    workedSoFar,

    deltaNow: workedSoFar - budgetSoFar,

    forecast,
    forecastDelta,

    budgetRemaining,
    requiredPerDayToReachBudget
  };
}


// ---------- Data model ----------
/*
days = {
  "YYYY-MM-DD": {
     startTs: number|null,  // endast relevant för "idag" (timljud)
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

// Aktiv dag (för bakåtredigering)
let activeDayKey = todayKey();

// ---------- DOM ----------
const todayPill = document.getElementById("todayPill");

const tabBtns = [...document.querySelectorAll(".tab")];
const panels = {
  accounts: document.getElementById("tab-accounts"),
  log: document.getElementById("tab-log"),
  history: document.getElementById("tab-history"),
};

const activeDate = document.getElementById("activeDate");

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

// History / Sammanställning
const periodType = document.getElementById("periodType");
const periodDate = document.getElementById("periodDate");
const refreshHistoryBtn = document.getElementById("refreshHistoryBtn");
const overviewBox = document.getElementById("overviewBox");
const perAccountBox = document.getElementById("perAccountBox");
const historyList = document.getElementById("historyList");
const forecastBox = document.getElementById("forecastBox");

const invoiceAccount = document.getElementById("invoiceAccount");
const invoiceMonth = document.getElementById("invoiceMonth");
const printInvoiceBtn = document.getElementById("printInvoiceBtn");
const printArea = document.getElementById("printArea");

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

// ---------- Day helpers ----------
function getDay(key) {
  if (!days[key]) days[key] = { startTs: null, endTs: null, slots: [] };
  return days[key];
}

function saveDays() {
  saveJSON(STORE.days, days);
}

function isTodayActive() {
  return activeDayKey === todayKey();
}

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
        <div class="left" style="flex:1; min-width:0;">
          <div class="title">
            <input class="account-edit" data-id="${a.id}" value="${escapeHtml(a.name)}"
              style="
                width:100%;
                padding:10px 10px;
                border-radius:12px;
                border:1px solid rgba(255,255,255,.12);
                background: rgba(0,0,0,.25);
                color: var(--text);
                outline:none;
              " />
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

      el.querySelector(".account-edit").addEventListener("change", (e) => {
        updateAccountName(a.id, e.target.value);
      });

      accountList.appendChild(el);
    });
   renderInvoiceAccountSelect();
}

addAccountBtn.addEventListener("click", () => addAccount(accountName.value));
accountName.addEventListener("keydown", (e) => {
  if (e.key === "Enter") addAccount(accountName.value);
});

// ---------- Slots + Start/Slut (endast idag) ----------
function startDay() {
  if (!isTodayActive()) return; // skydd: endast idag

  const d = getDay(activeDayKey);
  if (d.startTs) return;

  d.startTs = Date.now();
  d.endTs = null;
  saveDays();
  renderDay();
  startChimeLoop();
}

function endDay() {
  if (!isTodayActive()) return; // skydd: endast idag

  const d = getDay(activeDayKey);
  if (!d.startTs) return alert("Starta dagen först.");

  d.endTs = Date.now();
  saveDays();
  renderDay();
  stopChimeLoop();
}

function addSlot() {
  const d = getDay(activeDayKey);

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
    isBreak: !!slotIsBreak.checked,
  });

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
  const d = getDay(activeDayKey);
  d.slots = d.slots.filter((s) => s.id !== slotId);
  saveDays();
  renderDay();
}

function toggleBreak(slotId) {
  const d = getDay(activeDayKey);
  const s = d.slots.find((x) => x.id === slotId);
  if (!s) return;
  s.isBreak = !s.isBreak;
  saveDays();
  renderDay();
}

function editSlot(slotId) {
  const d = getDay(activeDayKey);
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

function clearDay() {
  const d = getDay(activeDayKey);
  if (!confirm("Rensa alla rader för vald dag?")) return;
  d.slots = [];
  saveDays();
  renderDay();
}

startDayBtn.addEventListener("click", startDay);
endDayBtn.addEventListener("click", endDay);
addSlotBtn.addEventListener("click", addSlot);
clearTodayBtn.addEventListener("click", clearDay);

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
  const d = getDay(activeDayKey);
  const isToday = isTodayActive();

  // Pills/labels
  setText(dayKeyView, `Aktiv dag: ${activeDayKey}`);
  setText(todayPill, `Idag: ${todayKey()}`);

  // Start/Slut: bara “idag”
  setText(
    dayStartView,
    isToday && d.startTs
      ? new Date(d.startTs).toLocaleTimeString("sv-SE", { hour: "2-digit", minute: "2-digit" })
      : "—"
  );
  setText(
    dayEndView,
    isToday && d.endTs
      ? new Date(d.endTs).toLocaleTimeString("sv-SE", { hour: "2-digit", minute: "2-digit" })
      : "—"
  );

  // Totals alltid från slots
  setText(breakView, fmtHM(dayBreakMinutes(d)));
  setText(workView, fmtHM(dayWorkMinutes(d)));

  // Disable Start/Slut när aktiv dag ≠ idag
  startDayBtn.disabled = !isToday || !!d.startTs;
  endDayBtn.disabled = !isToday || !d.startTs || !!d.endTs;

  if (!isToday) {
    setText(chimeView, "Start/Slut bara för idag (timljud kräver att dagen är igång).");
  } else {
    setText(chimeView, d.startTs && !d.endTs ? "Timljud: på (varje timme efter start)" : "Timljud: av");
  }

  // Default för slot start
  const nowM = parseTimeToMinutes(nowTimeHHMM());
  if (nowM !== null && !slotStart.value) {
    slotStart.value = minutesToTime(nowM);
  }

  // Render slots
  slotList.innerHTML = "";
  if (!d.slots.length) {
    slotList.innerHTML = `
      <div class="item">
        <div class="left">
          <div class="title muted">Inga rader ännu</div>
          <div class="meta">Lägg till en rad med start + stopptid.</div>
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

// ---------- Hourly chime (endast idag) ----------
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
  } catch {}
}

function startChimeLoop() {
  stopChimeLoop();

  // bara om aktiv dag är idag
  if (!isTodayActive()) return;

  const d = getDay(activeDayKey);
  if (!d.startTs || d.endTs) return;

  chimeNextTs = d.startTs + 60 * 60 * 1000;

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
}

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
    totalBreakMin += dayBreakMinutes(day);
    totalWorkMin += dayWorkMinutes(day);

    (day.slots || []).forEach((s) => {
      rows.push({ date: k, ...s });

      const dur = slotDurationMin(s);
      if (s.isBreak) return;

      const accId = s.accountId || "";
      perAccMin.set(accId, (perAccMin.get(accId) || 0) + dur);
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
      .sort((a, b) =>
        (a.date + minutesToTime(a.startMin)).localeCompare(b.date + minutesToTime(b.startMin), "sv")
      )
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

  // ---- Prognos (endast meningsfull för månad) ----
  if (forecastBox) {
    if (type !== "month") {
      forecastBox.innerHTML = `<div class="muted">Välj period: <strong>Månad</strong> för att se prognos.</div>`;
    } else {
      const yyyyMm = (dateStr || todayKey()).slice(0, 7);
      const f = monthForecast(days, yyyyMm);

      forecastBox.innerHTML = `
        <div class="kv">
          <div><span class="k">Arbetsdagar (månad)</span> <span class="v">${f.workdaysInMonth}</span></div>
          <div><span class="k">Arbetsdagar hittills</span> <span class="v">${f.elapsedWorkdays}</span></div>
          <div><span class="k">Budget hittills</span> <span class="v">${f.budgetSoFar.toFixed(1).replace(".", ",")} h</span></div>
          <div><span class="k">Utfall hittills</span> <span class="v strong">${f.workedSoFar.toFixed(1).replace(".", ",")} h</span></div>
          <div><span class="k">Diff nu</span> <span class="v">${f.deltaNow.toFixed(1).replace(".", ",")} h</span></div>

          <hr class="sep" />

          <div><span class="k">Budget kvar</span> <span class="v">${f.budgetRemaining.toFixed(1).replace(".", ",")} h</span></div>
          <div><span class="k">Krävs snitt/dag (resten)</span> <span class="v strong">${f.requiredPerDayToReachBudget.toFixed(2).replace(".", ",")} h</span></div>

          <hr class="sep" />

          <div><span class="k">Prognos månad</span> <span class="v strong">${f.forecast.toFixed(1).replace(".", ",")} h</span></div>
          <div><span class="k">Prognos vs budget</span> <span class="v">${f.forecastDelta.toFixed(1).replace(".", ",")} h</span></div>
        </div>
      `;
    }
  }
}


refreshHistoryBtn.addEventListener("click", renderHistory);
periodType.addEventListener("change", renderHistory);
periodDate.addEventListener("change", renderHistory);

// ---------- Active day selector ----------
if (activeDate) {
  activeDate.value = activeDayKey;
  activeDate.addEventListener("change", () => {
    activeDayKey = activeDate.value || todayKey();

    // Byter dag => stoppa alltid chime.
    stopChimeLoop();

    renderDay();

    // Starta chime igen om vi är på idag och dagen är igång
    const d = getDay(activeDayKey);
    if (isTodayActive() && d.startTs && !d.endTs) startChimeLoop();
  });
}

function buildInvoiceRows(monthYYYYMM, accountIdOrAll){
  // returns { rows: [...], totalMinutes }
  const rows = [];
  let totalMinutes = 0;

  const keys = Object.keys(days)
    .filter(k => k.startsWith(monthYYYYMM + "-"))
    .sort();

  for (const k of keys){
    const d = days[k];
    const slots = (d?.slots || [])
      .filter(s => !s.isBreak)
      .filter(s => accountIdOrAll === "ALL" ? true : (s.accountId === accountIdOrAll))
      .slice()
      .sort((a,b) => a.startMin - b.startMin);

    for (const s of slots){
      const mins = slotDurationMin(s);
      if (mins <= 0) continue;

      totalMinutes += mins;

      rows.push({
        date: k,
        accountName: accountNameById(s.accountId) || "(ej valt)",
        start: minutesToTime(s.startMin),
        end: minutesToTime(s.endMin),
        minutes: mins,
        hoursDec: minutesToDecimalHours(mins),
        text: s.text || ""
      });
    }
  }

  return { rows, totalMinutes };
}

function renderInvoiceAccountSelect(){
  if (!invoiceAccount) return;

  invoiceAccount.innerHTML = "";
  const optAll = document.createElement("option");
  optAll.value = "ALL";
  optAll.textContent = "Alla konton";
  invoiceAccount.appendChild(optAll);

  accounts
    .slice()
    .sort((a,b)=>a.name.localeCompare(b.name,"sv"))
    .forEach(a => {
      const opt = document.createElement("option");
      opt.value = a.id;
      opt.textContent = a.name;
      invoiceAccount.appendChild(opt);
    });
}

function buildInvoicePrintHtml(monthVal, accVal){
  const { rows, totalMinutes } = buildInvoiceRows(monthVal, accVal);

  const accLabel =
    accVal === "ALL" ? "Alla konton" : (accountNameById(accVal) || "(ej valt)");

  const totalHours = minutesToDecimalHours(totalMinutes);

  // Tabellrader
  let tr = "";
  for (const r of rows){
    tr += `
      <tr>
        <td>${escapeHtml(formatDateSv(r.date))}</td>
        <td>${escapeHtml(r.start)}–${escapeHtml(r.end)}</td>
        <td class="right">${escapeHtml(formatHoursSv(r.hoursDec))}</td>
        <td>${escapeHtml(r.text || "")}</td>
      </tr>
    `;
  }

  return `
    <h1 class="page-break">underlag</h1>
     <div class="kv">
       <div><b>Månad:</b> ${escapeHtml(monthVal)}</div>
       <div><b>Konto:</b> ${escapeHtml(accLabel)}</div>
     </div>

    <table>
      <thead>
        <tr>
          <th>Datum</th>
          <th>Tid</th>
          <th class="right">Timmar</th>
          <th>Aktivitet</th>
        </tr>
      </thead>
      <tbody>
        ${tr}
        <tr class="sumrow">
          <td colspan="2">SUMMA</td>
          <td class="right">${escapeHtml(formatHoursSv(totalHours))}</td>
          <td></td>
        </tr>
      </tbody>
    </table>
  `;
}

function safeFilePart(s){
  return String(s || "")
    .replace(/[\\/:*?"<>|]+/g, "-")
    .replace(/\s+/g, " ")
    .trim();
}

function setPdfTitleForUnderlag(){
  const invNo = safeFilePart(getInvoiceNo());
  setTitleHard(`Fakturaunderlag-${invNo} Jubrion AB`);
}


function setTitleHard(newTitle){
  document.title = newTitle;
  const t = document.querySelector("title");
  if (t) t.textContent = newTitle;
}

function printInvoicePdf(){
  const monthVal = (invoiceMonth?.value || "").trim();
  if (!monthVal) return alert("Välj en månad.");

  const accVal = invoiceAccount?.value || "ALL";
  const { rows } = buildInvoiceRows(monthVal, accVal);
  if (!rows.length){
    return alert("Inga arbetspass hittades för vald månad/konto.");
  }

  if (!printArea) return alert("printArea saknas i index.html.");

  printArea.innerHTML = buildInvoicePrintHtml(monthVal, accVal);

  const oldTitle = document.title;
  const oldTitleEl = document.querySelector("title")?.textContent || oldTitle;

  // Sätt filnamn (extra “hårt”) innan print preview öppnas
  setPdfTitleForUnderlag();

  // Android/PWA behöver ofta en liten delay
  setTimeout(() => {
    window.print();

    // Återställ efteråt
    setTimeout(() => {
      setTitleHard(oldTitleEl);
      printArea.innerHTML = "";
    }, 800);
  }, 250);
}

// ---------- Init ----------
function init() {
  setText(todayPill, `Idag: ${todayKey()}`);
  renderAccounts();
  renderAccountSelect();
  renderDay();

  periodDate.value = todayKey();

  // start chime om dagens loggning redan är igång
  const d = getDay(todayKey());
  if (d.startTs && !d.endTs) startChimeLoop();

   // : init
   if (invoiceMonth) invoiceMonth.value = todayKey().slice(0,7);
      renderInvoiceAccountSelect();

   if (printInvoiceBtn) printInvoiceBtn.addEventListener("click", printInvoicePdf);

   // --- Öppna  (HTML) ---
   const openInvoiceHtmlBtn = document.getElementById("openInvoiceHtmlBtn");
   if (openInvoiceHtmlBtn) {
     openInvoiceHtmlBtn.addEventListener("click", () => {
       const month = (invoiceMonth?.value || "").trim();
       if (!month) {
         alert("Välj en månad.");
         return;
       }

       const accId = (invoiceAccount?.value || "ALL").trim();

       const price = 650;   // á-pris
       const vat = 0.25;    // 25 % moms

       const d = new Date();
       const yyyy = d.getFullYear();
       const mm = String(d.getMonth() + 1).padStart(2, "0");
       const dd = String(d.getDate()).padStart(2, "0");
       const invDate = `${yyyy}-${mm}-${dd}`;

       const invNo = getInvoiceNo();
       const url =
         `invoice.html?month=${encodeURIComponent(month)}` +
         `&account=${encodeURIComponent(accId)}` +
         `&price=${encodeURIComponent(price)}` +
         `&vat=${encodeURIComponent(vat)}` +
         `&date=${encodeURIComponent(invDate)}` +
         `&no=${encodeURIComponent(invNo)}`;

       // PWA / mobil: öppna i samma flik
       location.href = url;
     });
   }

   const openUnderlagHtmlBtn = document.getElementById("openUnderlagHtmlBtn");
   if (openUnderlagHtmlBtn){
     openUnderlagHtmlBtn.addEventListener("click", () => {
       const monthVal = (invoiceMonth?.value || "").trim();
       if (!monthVal) return alert("Välj en månad.");

       const accVal = (invoiceAccount?.value || "ALL").trim();
       const { rows } = buildInvoiceRows(monthVal, accVal);
       if (!rows.length) return alert("Inga arbetspass hittades för vald månad/konto.");

       const accLabel = accVal === "ALL" ? "Alla konton" : (accountNameById(accVal) || accVal);
       
        console.log("rows[0] exempel:", rows[0]);

        const compactRows = rows.map(r => ({
          date: r.date,
          start: r.start,
          end: r.end,
          hours: r.hoursDec,
          text: r.text || "",

        // NYTT: konto per rad (tar det som finns, annars tomt)
           konto: r.konto ?? r.account ?? r.accountNo ?? "",
           kontonamn: r.kontonamn ?? r.account_name ?? r.accountName ?? ""
      }));

       const invNo = getInvoiceNo();

       const payload = { v:1, createdAt:Date.now(), invNo, month:monthVal, account:accLabel, rows:compactRows };
       localStorage.setItem("tl_underlag_payload_v1", JSON.stringify(payload));

       location.href = "underlag.html?from=ls";
     });
   }

   // ===== Backup Export (localStorage) =====
   
   document.getElementById("btnBackupExport").addEventListener("click", () => {
     const now = new Date();
     const exported = now.toISOString().slice(0, 10);
   
     const payload = {
       app: "TimeLedger",
       exported,
       schema: 1,
       data: Object.fromEntries(
         TL_KEYS.map(k => [k, localStorage.getItem(k)])
       )
     };
   
     const blob = new Blob(
       [JSON.stringify(payload, null, 2)],
       { type: "application/json" }
     );
   
     const url = URL.createObjectURL(blob);
     const a = document.createElement("a");
     a.href = url;
     a.download = `timeledger-backup-${exported}.json`;
     document.body.appendChild(a);
     a.click();
     a.remove();
     URL.revokeObjectURL(url);
   });
   
   
   // ===== Backup Import (SAFE RESTORE + UNDO) =====
   document.getElementById("btnBackupImport").addEventListener("click", () => {
     document.getElementById("backupFileInput").click();
   });
   
   document.getElementById("backupFileInput").addEventListener("change", async (e) => {
     const file = e.target.files?.[0];
     if (!file) return;
   
     try {
       const text = await file.text();
       const backup = JSON.parse(text);
   
       if (!backup?.data || typeof backup.data !== "object") {
         throw new Error("Ogiltig backupfil (saknar data).");
       }
   
       // 1) Visa sammanfattning utan att skriva något
       const info = TL_KEYS.map(k => {
         const raw = backup.data[k];
         const chars = typeof raw === "string" ? raw.length : 0;
         return `${k}: ${chars} tecken`;
       }).join("\n");
   
       const okPreview = confirm(
         `Backup hittad:\n` +
         `app: ${backup.app ?? "okänd"}\n` +
         `exported: ${backup.exported ?? "okänd"}\n` +
         `schema: ${backup.schema ?? "?"}\n\n` +
         `Innehåll:\n${info}\n\n` +
         `Tryck OK för att gå vidare till ÅTERSTÄLLNING (ersätter lokala data).`
       );
       if (!okPreview) return;
   
       // 2) NÖDBROMS: spara nuvarande läge (för ångra)
       const before = Object.fromEntries(TL_KEYS.map(k => [k, localStorage.getItem(k)]));
       sessionStorage.setItem("tl_backup_before_import", JSON.stringify(before));
   
       // 3) Sista varningen: detta är “Replace”, inte merge
       const okReplace = confirm(
         `ÅTERSTÄLLNING (REPLACE)\n\n` +
         `Detta ersätter lokala data för:\n` +
         `${TL_KEYS.join(", ")}\n\n` +
         `Du kan ångra direkt efteråt med knappen "Ångra senaste import".\n\n` +
         `Genomföra återställning?`
       );
       if (!okReplace) return;
   
       // 4) Skriv exakt det som fanns i backupen (rå strängar)
       for (const k of TL_KEYS) {
         const v = backup.data[k];
         if (typeof v === "string") {
           localStorage.setItem(k, v);
         } else if (v == null) {
           // om nyckeln saknas i backupen, lämna som den är
         } else {
           // om någon råkat göra fel format, stoppa hellre än skriva skräp
           throw new Error(`Fel format i backupen för ${k} (förväntade string).`);
         }
       }
   
       alert("Klart! Återställt från backup. Ladda om appen.");
   
     } catch (err) {
       alert("Kunde inte importera: " + (err?.message || err));
     } finally {
       e.target.value = "";
     }
   });

}
init();
