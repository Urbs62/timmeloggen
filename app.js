/* Timmeloggen v1 – gymapp-liknande upplägg
   - 3 flikar: Konton, Tidsloggning, Historik
   - 30-min slots: tid + konto + text + "rast/lunch"
   - Start/Slut dag + arbetstid = (slut-start) - rast
   - Timljud varje timme efter start
   - localStorage
*/
const slotStart = document.getElementById("slotStart");
const slotEnd   = document.getElementById("slotEnd");

const STORE = {
  accounts: "tl_accounts_v1",
  days: "tl_days_v1"
};

// ---------- Helpers ----------
const pad2 = (n) => String(n).padStart(2, "0");

function todayKey() {
  const d = new Date();
  return `${d.getFullYear()}-${pad2(d.getMonth()+1)}-${pad2(d.getDate())}`;
}

function fmtHM(mins){
  const h = Math.floor(mins/60);
  const m = mins%60;
  return `${h}:${pad2(m)}`;
}

function parseTimeToMinutes(hhmm){
  if (!hhmm || !hhmm.includes(":")) return null;
  const [h,m] = hhmm.split(":").map(x => parseInt(x,10));
  if (Number.isNaN(h) || Number.isNaN(m)) return null;
  return h*60 + m;
}

function minutesToTime(mins){
  const h = Math.floor(mins/60);
  const m = mins%60;
  return `${pad2(h)}:${pad2(m)}`;
}

function roundToHalfHourMinutes(mins){
  // närmaste 30 minuter
  const r = Math.round(mins/30)*30;
  // clamp 0..1430 (23:50 -> 24:00 vill vi ej)
  return Math.max(0, Math.min(1410, r));
}

function nowTimeHHMM(){
  const d = new Date();
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

function setText(el, text){ el.textContent = text; }

function loadJSON(key, fallback){
  try{
    const v = localStorage.getItem(key);
    return v ? JSON.parse(v) : fallback;
  }catch{
    return fallback;
  }
}

function saveJSON(key, value){
  localStorage.setItem(key, JSON.stringify(value));
}

function uid(){
  return Math.random().toString(16).slice(2) + Date.now().toString(16);
}

// ---------- Data model ----------
/*
days = {
  "YYYY-MM-DD": {
     startTs: number|null,
     endTs: number|null,
     slots: [
       { id, time:"HH:MM", minutes: <0..1410>, accountId, text, isBreak, durationMin:30 }
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

const slotTime = document.getElementById("slotTime");
const slotAccount = document.getElementById("slotAccount");
const slotText = document.getElementById("slotText");
const slotIsBreak = document.getElementById("slotIsBreak");
const addSlotBtn = document.getElementById("addSlotBtn");

const slotList = document.getElementById("slotList");
const clearTodayBtn = document.getElementById("clearTodayBtn");
const exportCsvBtn = document.getElementById("exportCsvBtn");

// History
const periodType = document.getElementById("periodType");
const periodDate = document.getElementById("periodDate");
const refreshHistoryBtn = document.getElementById("refreshHistoryBtn");
const overviewBox = document.getElementById("overviewBox");
const perAccountBox = document.getElementById("perAccountBox");
const historyList = document.getElementById("historyList");

// ---------- Tabs ----------
tabBtns.forEach(btn => {
  btn.addEventListener("click", () => {
    tabBtns.forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
    const key = btn.dataset.tab;
    Object.values(panels).forEach(p => p.classList.remove("active"));
    panels[key].classList.add("active");
    if (key === "history") renderHistory();
  });
});

// ---------- Accounts ----------
function ensureDefaultAccounts(){
  if (accounts.length) return;
  // valfritt: skapa ett default så select inte är tom
  accounts = [];
  saveJSON(STORE.accounts, accounts);
}

function addAccount(name){
  const n = (name || "").trim();
  if (!n) return alert("Skriv ett kontonamn/nummer.");
  if (accounts.some(a => a.name.toLowerCase() === n.toLowerCase())) {
    return alert("Kontot finns redan.");
  }
  accounts.push({ id: uid(), name: n });
  saveJSON(STORE.accounts, accounts);
  renderAccounts();
  renderAccountSelect();
}

function deleteAccount(id){
  // kontot kan finnas i historik; vi tar bara bort från listan
  accounts = accounts.filter(a => a.id !== id);
  saveJSON(STORE.accounts, accounts);
  renderAccounts();
  renderAccountSelect();
}

function renderAccounts(){
  accountList.innerHTML = "";
  if (!accounts.length){
    accountList.innerHTML = `<div class="item"><div class="left"><div class="title muted">Inga konton ännu</div><div class="meta">Lägg till ett konto ovan.</div></div></div>`;
    return;
  }

  accounts
    .slice()
    .sort((a,b) => a.name.localeCompare(b.name,"sv"))
    .forEach(a => {
      const el = document.createElement("div");
      el.className = "item";
      el.innerHTML = `
        <div class="left">
          <div class="title">${escapeHtml(a.name)}</div>
          <div class="meta">ID: ${a.id}</div>
        </div>
        <div>
          <button class="danger secondary" data-del="${a.id}">Ta bort</button>
        </div>
      `;
      el.querySelector("[data-del]").addEventListener("click", () => {
        if (confirm(`Ta bort konto "${a.name}"?`)) deleteAccount(a.id);
      });
      accountList.appendChild(el);
    });
}

addAccountBtn.addEventListener("click", () => addAccount(accountName.value));
accountName.addEventListener("keydown", (e) => {
  if (e.key === "Enter") addAccount(accountName.value);
});

// ---------- Day / slots ----------
function getDay(key){
  if (!days[key]) days[key] = { startTs: null, endTs: null, slots: [] };
  return days[key];
}

function saveDays(){
  saveJSON(STORE.days, days);
}

function startDay(){
  const key = todayKey();
  const d = getDay(key);
  if (d.startTs) {
    // redan startad idag
    return;
  }
  d.startTs = Date.now();
  d.endTs = null;
  saveDays();
  renderDay();
  startChimeLoop();
}

function endDay(){
  const key = todayKey();
  const d = getDay(key);
  if (!d.startTs) return alert("Starta dagen först.");
  d.endTs = Date.now();
  saveDays();
  renderDay();
  stopChimeLoop();
}

function addSlot(){
  const key = todayKey();
  const d = getDay(key);

  if (!d.startTs) {
    alert("Starta dagen först.");
    return;
  }

  const startMin = parseTimeToMinutes(slotStart.value);
  const endMin   = parseTimeToMinutes(slotEnd.value);

  if (startMin === null || endMin === null || endMin <= startMin) {
    alert("Ogiltig start- eller stopptid.");
    return;
  }

   const startMin = parseTimeToMinutes(slotStart.value);
   const endMin   = parseTimeToMinutes(slotEnd.value);

   if (startMin === null || endMin === null || endMin <= startMin) {
     alert("Ogiltig start- eller stopptid.");
     return;
   }

   d.slots.push({
     id: uid(),
     startMin,
     endMin,
     accountId: slotAccount.value || "",
     text: slotText.value.trim(),
     isBreak: slotIsBreak.checked
   });
   
  saveDays();
  renderDay();

  slotText.value = "";
  slotIsBreak.checked = false;
}

function deleteSlot(slotId){
  const key = todayKey();
  const d = getDay(key);
  d.slots = d.slots.filter(s => s.id !== slotId);
  saveDays();
  renderDay();
}

function toggleBreak(slotId){
  const key = todayKey();
  const d = getDay(key);
  const s = d.slots.find(x=>x.id===slotId);
  if (!s) return;
  s.isBreak = !s.isBreak;
  saveDays();
  renderDay();
}

function editSlot(slotId){
  const key = todayKey();
  const d = getDay(key);
  const s = d.slots.find(x=>x.id===slotId);
  if (!s) return;

  const newTime = prompt("Ny tid (HH:MM)", s.time);
  if (newTime === null) return;
  let mins = parseTimeToMinutes(newTime);
  if (mins === null) return alert("Ogiltig tid.");
  mins = roundToHalfHourMinutes(mins);

  const newText = prompt("Ny text", s.text || "");
  if (newText === null) return;

  s.minutes = mins;
  s.time = minutesToTime(mins);
  s.text = newText.trim();

  // konto-edit via prompt (snabb v1)
  const currentAccName = accountNameById(s.accountId);
  const newAccName = prompt("Konto (skriv exakt namn, eller tomt)", currentAccName || "");
  if (newAccName !== null){
    const found = accounts.find(a => a.name.toLowerCase() === newAccName.trim().toLowerCase());
    s.accountId = found ? found.id : "";
  }

  d.slots.sort((a,b)=>a.minutes-b.minutes);
  saveDays();
  renderDay();
}

function clearToday(){
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
function minutesBetween(ts1, ts2){
  if (!ts1 || !ts2) return 0;
  return Math.max(0, Math.round((ts2 - ts1) / 60000));
}

function dayBreakMinutes(day){
  return (day.slots || [])
    .filter(s => s.isBreak)
    .reduce((sum, s) => sum + (s.durationMin || 30), 0);
}

function dayWorkMinutes(day){
  if (!day.startTs) return 0;
  const end = day.endTs || Date.now();
  const base = minutesBetween(day.startTs, end);
  const breaks = dayBreakMinutes(day);
  return Math.max(0, base - breaks);
}

function accountNameById(id){
  const a = accounts.find(x => x.id === id);
  return a ? a.name : "";
}

function escapeHtml(s){
  return (s ?? "")
    .replaceAll("&","&amp;")
    .replaceAll("<","&lt;")
    .replaceAll(">","&gt;")
    .replaceAll('"',"&quot;");
}

// ---------- Render log tab ----------
function renderAccountSelect(){
  slotAccount.innerHTML = `<option value="">(Välj konto)</option>`;
  accounts
    .slice()
    .sort((a,b)=>a.name.localeCompare(b.name,"sv"))
    .forEach(a => {
      const opt = document.createElement("option");
      opt.value = a.id;
      opt.textContent = a.name;
      slotAccount.appendChild(opt);
    });
}

function renderDay(){
  const key = todayKey();
  const d = getDay(key);

  dayKeyView.textContent = `Datum: ${key}`;
  todayPill.textContent = `Idag: ${key}`;

  setText(dayStartView, d.startTs ? new Date(d.startTs).toLocaleTimeString("sv-SE",{hour:"2-digit",minute:"2-digit"}) : "—");
  setText(dayEndView, d.endTs ? new Date(d.endTs).toLocaleTimeString("sv-SE",{hour:"2-digit",minute:"2-digit"}) : "—");

  const b = dayBreakMinutes(d);
  setText(breakView, fmtHM(b));

  const w = dayWorkMinutes(d);
  setText(workView, fmtHM(w));

  startDayBtn.disabled = !!d.startTs;
  endDayBtn.disabled = !d.startTs || !!d.endTs;

  // default slot time = nu avrundat
  const nowM = parseTimeToMinutes(nowTimeHHMM());
  if (nowM !== null) {
    const rounded = roundToHalfHourMinutes(nowM);
    slotTime.value = minutesToTime(rounded);
  }

  slotList.innerHTML = "";
  if (!d.slots.length){
    slotList.innerHTML = `<div class="item"><div class="left"><div class="title muted">Inga slots ännu</div><div class="meta">Lägg till en 30-min slot här till vänster.</div></div></div>`;
    return;
  }

  d.slots.forEach(s => {
    const acc = accountNameById(s.accountId) || "(ej valt)";
    const meta = `${s.time} • ${acc}${s.isBreak ? " • Rast/Lunch" : ""}`;
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

function playChime(){
  try{
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;

    const ctx = new AudioCtx();
    const gain = ctx.createGain();
    gain.gain.value = 0.06;
    gain.connect(ctx.destination);

    // Tre toner: "specifikt ljud"
    const freqs = [880, 660, 880];
    let t = ctx.currentTime;

    freqs.forEach((f, i) => {
      const osc = ctx.createOscillator();
      osc.type = "sine";
      osc.frequency.value = f;
      osc.connect(gain);
      osc.start(t);
      osc.stop(t + 0.18);
      t += 0.22;
    });

    setTimeout(() => ctx.close(), 1200);
  }catch{
    // ignore
  }
}

function startChimeLoop(){
  stopChimeLoop();

  const key = todayKey();
  const d = getDay(key);
  if (!d.startTs || d.endTs) {
    chimeView.textContent = "Timljud: av";
    return;
  }

  // nästa timme räknat från startTs
  const start = d.startTs;
  chimeNextTs = start + 60*60*1000;
  chimeView.textContent = "Timljud: på (varje hel timme efter start)";

  chimeTimer = setInterval(() => {
    const now = Date.now();
    if (!chimeNextTs) return;
    if (now >= chimeNextTs){
      // om vi ligger efter (dator sovit), hoppa fram
      while (now >= chimeNextTs) chimeNextTs += 60*60*1000;
      playChime();
    }
  }, 20_000); // var 20s räcker
}

function stopChimeLoop(){
  if (chimeTimer) clearInterval(chimeTimer);
  chimeTimer = null;
  chimeNextTs = null;
  chimeView.textContent = "Timljud: av";
}

// ---------- CSV export ----------
exportCsvBtn.addEventListener("click", () => {
  const rows = [];
  rows.push(["Datum","Start","Slut","SlotTid","Konto","Rast","Text"].join(";"));

  const keys = Object.keys(days).sort();
  for (const k of keys){
    const d = days[k];
    const start = d.startTs ? new Date(d.startTs).toLocaleTimeString("sv-SE",{hour:"2-digit",minute:"2-digit"}) : "";
    const end = d.endTs ? new Date(d.endTs).toLocaleTimeString("sv-SE",{hour:"2-digit",minute:"2-digit"}) : "";

    if (!d.slots.length){
      rows.push([k,start,end,"","","",""].join(";"));
      continue;
    }

    d.slots.forEach(s => {
      const acc = accountNameById(s.accountId);
      const isBreak = s.isBreak ? "1" : "0";
      const text = (s.text || "").replaceAll('"','""');
      rows.push([k,start,end,s.time,acc,isBreak,`"${text}"`].join(";"));
    });
  }

  const blob = new Blob([rows.join("\n")], { type:"text/csv;charset=utf-8" });
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
function isoWeekKeyFromDate(dateObj){
  // ISO week number
  const d = new Date(Date.UTC(dateObj.getFullYear(), dateObj.getMonth(), dateObj.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(),0,1));
  const weekNo = Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
  return `${d.getUTCFullYear()}-W${pad2(weekNo)}`;
}

function monthKeyFromDate(dateObj){
  return `${dateObj.getFullYear()}-${pad2(dateObj.getMonth()+1)}`;
}

function dayKeyFromDate(dateObj){
  return `${dateObj.getFullYear()}-${pad2(dateObj.getMonth()+1)}-${pad2(dateObj.getDate())}`;
}

function periodKeys(type, dateStr){
  const d = dateStr ? new Date(dateStr + "T12:00:00") : new Date();
  if (Number.isNaN(d.getTime())) return [];

  const keys = Object.keys(days);
  if (type === "day"){
    const k = dayKeyFromDate(d);
    return keys.filter(x => x === k);
  }

  if (type === "month"){
    const mk = monthKeyFromDate(d);
    return keys.filter(x => x.startsWith(mk + "-"));
  }

  // week: match ISO week of each day key
  const targetW = isoWeekKeyFromDate(d);
  return keys.filter(k => {
    const kd = new Date(k + "T12:00:00");
    if (Number.isNaN(kd.getTime())) return false;
    return isoWeekKeyFromDate(kd) === targetW;
  });
}

function aggregateForKeys(keys){
  // totals
  let totalWorkMin = 0;
  let totalBreakMin = 0;

  // per account: sum of slot durations (non-break) grouped by accountId
  const perAccMin = new Map();

  // collect slot rows
  const rows = [];

  keys.sort().forEach(k => {
    const day = days[k];
    const b = dayBreakMinutes(day);
    const w = dayWorkMinutes(day);

    totalBreakMin += b;
    totalWorkMin += w;

    (day.slots || []).forEach(s => {
      rows.push({ date:k, ...s });

      if (!s.isBreak) {
        const accId = s.accountId || "";
        const prev = perAccMin.get(accId) || 0;
        perAccMin.set(accId, prev + (s.durationMin || 30));
      }
    });
  });

  return { totalWorkMin, totalBreakMin, perAccMin, rows };
}

function renderHistory(){
  const type = periodType.value;
  const dateStr = periodDate.value || todayKey();
  if (!periodDate.value) periodDate.value = todayKey();

  const keys = periodKeys(type, dateStr);
  const { totalWorkMin, totalBreakMin, perAccMin, rows } = aggregateForKeys(keys);

  // Overview
  const label =
    type === "day" ? `Dag: ${dateStr}` :
    type === "month" ? `Månad: ${dateStr.slice(0,7)}` :
    `Vecka: ${isoWeekKeyFromDate(new Date(dateStr+"T12:00:00"))}`;

  overviewBox.innerHTML = `
    <div><span class="k">Period</span> <span class="v">${label}</span></div>
    <div><span class="k">Arbetstid</span> <span class="v strong">${fmtHM(totalWorkMin)}</span></div>
    <div><span class="k">Rast/lunch</span> <span class="v">${fmtHM(totalBreakMin)}</span></div>
    <div><span class="k">Dagar med data</span> <span class="v">${keys.length}</span></div>
  `;

  // Per account
  if (perAccMin.size === 0){
    perAccountBox.innerHTML = `<div class="muted">Inga slots i perioden.</div>`;
  } else {
    const entries = [...perAccMin.entries()]
      .map(([accId, min]) => ({ accId, min, name: accountNameById(accId) || "(ej valt)" }))
      .sort((a,b) => b.min - a.min);

    let html = `<div class="list">`;
    entries.forEach(e => {
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

  // Rows list (slots)
  historyList.innerHTML = "";
  if (!rows.length){
    historyList.innerHTML = `<div class="item"><div class="left"><div class="title muted">Inga poster</div><div class="meta">Inget att visa i vald period.</div></div></div>`;
  } else {
    rows
      .slice()
      .sort((a,b) => (a.date+a.time).localeCompare(b.date+b.time,"sv"))
      .forEach(r => {
        const acc = accountNameById(r.accountId) || "(ej valt)";
        const meta = `${r.date} • ${r.time} • ${acc}${r.isBreak ? " • Rast/Lunch" : ""}`;
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

// ---------- Init ----------
function init(){
  ensureDefaultAccounts();

  todayPill.textContent = `Idag: ${todayKey()}`;
  renderAccounts();
  renderAccountSelect();
  renderDay();

  // init history date to today
  periodDate.value = todayKey();

  // start chime if day already started (om du råkar ha kvar state)
  const d = getDay(todayKey());
  if (d.startTs && !d.endTs) startChimeLoop();
}
init();
