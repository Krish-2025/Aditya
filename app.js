const DB_NAME = "bp-log-db";
const DB_VERSION = 1;
const STORE_NAME = "readings";
const CONFIG_KEY = "bp-log-supabase-config";
const AUTH_CALLBACK_KEYS = ["code", "access_token", "refresh_token", "error", "error_code", "error_description"];
const SLOTS = ["Morning", "Evening", "Night"];
const SLOT_WINDOWS = [
  { slot: "Morning", startHour: 4, endHour: 12 },
  { slot: "Evening", startHour: 12, endHour: 19 },
];
const DEFAULT_MEASUREMENTS = 3;
const MIN_MEASUREMENTS = 1;
const MAX_MEASUREMENTS = 4;

let db;
let readings = [];
let chart;
let supabaseClient = null;
let supabaseSession = null;
let chartPluginsRegistered = false;
let measurementCount = DEFAULT_MEASUREMENTS;

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => Array.from(document.querySelectorAll(selector));

const els = {
  todayTitle: $("#todayTitle"),
  todaySubtitle: $("#todaySubtitle"),
  slotStatus: $("#slotStatus"),
  form: $("#readingForm"),
  formAlert: $("#formAlert"),
  measurementRows: $("#measurementRows"),
  slotHint: $("#slotHint"),
  rawTable: $("#rawTable"),
  lastCategory: $("#lastCategory"),
  lastCategoryText: $("#lastCategoryText"),
  syncStatus: $("#syncStatus"),
  settingsDialog: $("#settingsDialog"),
  settingsAlert: $("#settingsAlert"),
  supabaseUrl: $("#supabaseUrl"),
  supabaseKey: $("#supabaseKey"),
  loginEmail: $("#loginEmail"),
  loginPassword: $("#loginPassword"),
  statsGrid: $("#statsGrid"),
};

function openDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(STORE_NAME)) {
        const store = database.createObjectStore(STORE_NAME, { keyPath: "id" });
        store.createIndex("takenAt", "takenAt");
        store.createIndex("syncState", "syncState");
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function tx(storeMode = "readonly") {
  return db.transaction(STORE_NAME, storeMode).objectStore(STORE_NAME);
}

function getAllReadings() {
  return new Promise((resolve, reject) => {
    const request = tx().getAll();
    request.onsuccess = () => resolve(request.result || []);
    request.onerror = () => reject(request.error);
  });
}

function putReading(reading) {
  return new Promise((resolve, reject) => {
    const request = tx("readwrite").put(reading);
    request.onsuccess = () => resolve(reading);
    request.onerror = () => reject(request.error);
  });
}

function deleteReading(id) {
  return new Promise((resolve, reject) => {
    const request = tx("readwrite").delete(id);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

function uuid() {
  if (crypto.randomUUID) return crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function formatDateTime(value) {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function formatDay(value) {
  return new Intl.DateTimeFormat(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  }).format(value);
}

function localDateString(date = new Date()) {
  const offset = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 10);
}

function readingLocalDate(reading) {
  return localDateString(new Date(reading.takenAt));
}

function hasReadingForDateSlot(readingList, date, slot) {
  return readingList.some((reading) => reading.slot === slot && readingLocalDate(reading) === date);
}

function previousLocalDateString(date = new Date()) {
  return localDateString(new Date(date.getTime() - 24 * 60 * 60 * 1000));
}

function localTimeString(date = new Date()) {
  return date.toTimeString().slice(0, 5);
}

function selectedReadingDateTime() {
  const date = $("#readingDate").value;
  const time = $("#readingTime").value;
  if (!date || !time) return null;
  const selected = new Date(`${date}T${time}`);
  return Number.isNaN(selected.getTime()) ? null : selected;
}

function isFutureReadingTime(selected = selectedReadingDateTime(), now = new Date()) {
  if (!selected) return false;
  return selected.getTime() > now.getTime();
}

function slotForTimeString(time) {
  const [hourText] = (time || "").split(":");
  const hour = Number(hourText);
  if (!Number.isFinite(hour)) return "";
  const matched = SLOT_WINDOWS.find((slotWindow) => hour >= slotWindow.startHour && hour < slotWindow.endHour);
  return matched ? matched.slot : "Night";
}

function updateSlotFromTime() {
  const time = $("#readingTime").value;
  const slot = slotForTimeString(time);
  if (!slot) return;
  $("#readingSlot").value = slot;
  if (els.slotHint) {
    const date = $("#readingDate").value;
    const alreadySaved = date && hasReadingForDateSlot(readings, date, slot);
    els.slotHint.textContent = alreadySaved
      ? `${slot} is already saved for this date. Choose another date or slot.`
      : `${slot} selected from ${time}. If the time is later than now, the date moves to yesterday.`;
  }
}

function updateDateTimeLimits({ shiftFutureTime = false } = {}) {
  const now = new Date();
  const today = localDateString(now);
  const currentTime = localTimeString(now);
  const dateInput = $("#readingDate");
  const timeInput = $("#readingTime");

  dateInput.max = today;
  if (dateInput.value > today) dateInput.value = today;

  timeInput.removeAttribute("max");
  if (shiftFutureTime && dateInput.value === today && timeInput.value && timeInput.value > currentTime) {
    dateInput.value = previousLocalDateString(now);
  }

  updateSlotFromTime();
}

function readingTimestamp(reading) {
  return new Date(reading.takenAt).getTime();
}

function readingAuditTimestamp(reading) {
  return new Date(reading.updatedAt || reading.createdAt || reading.takenAt).getTime();
}

function compareReadingsOldestFirst(a, b) {
  return readingTimestamp(a) - readingTimestamp(b) || readingAuditTimestamp(a) - readingAuditTimestamp(b);
}

function compareReadingsNewestFirst(a, b) {
  return readingTimestamp(b) - readingTimestamp(a) || readingAuditTimestamp(b) - readingAuditTimestamp(a);
}

function categoryFor(systolic, diastolic) {
  if (systolic > 180 || diastolic > 120) {
    return {
      key: "severe",
      label: "Severe range",
      text: "If symptoms are present, seek emergency care. Without symptoms, contact a health professional promptly.",
    };
  }
  if (systolic >= 140 || diastolic >= 90) {
    return {
      key: "stage2",
      label: "Stage 2 range",
      text: "This is above the usual stage 2 reference line for ages 13 and older.",
    };
  }
  if (systolic >= 130 || diastolic >= 80) {
    return {
      key: "stage1",
      label: "Stage 1 range",
      text: "This is above the usual hypertension reference line for ages 13 and older.",
    };
  }
  if (systolic >= 120 && diastolic < 80) {
    return {
      key: "elevated",
      label: "Elevated range",
      text: "Systolic is elevated while diastolic remains below 80.",
    };
  }
  return {
    key: "normal",
    label: "Normal range",
    text: "This reading is below 120/80.",
  };
}

function numberFromInput(input) {
  const value = input.value.trim();
  return value === "" ? Number.NaN : Number(value);
}

function collectMeasurementSet() {
  return $$(".measurement-row").map((row, index) => ({
    number: index + 1,
    systolic: numberFromInput(row.querySelector("[data-field='systolic']")),
    diastolic: numberFromInput(row.querySelector("[data-field='diastolic']")),
  }));
}

function averageMeasurementSet(measurements) {
  const count = measurements.length;
  return {
    systolic: Math.round(measurements.reduce((sum, item) => sum + item.systolic, 0) / count),
    diastolic: Math.round(measurements.reduce((sum, item) => sum + item.diastolic, 0) / count),
  };
}

function validateMeasurementSet(measurements) {
  if (!measurements.length) return "Add at least one blood pressure reading.";
  if (measurements.some((item) => !Number.isFinite(item.systolic) || !Number.isFinite(item.diastolic))) {
    return "Enter systolic and diastolic for each reading row.";
  }
  const outOfRange = measurements.some((item) => item.systolic < 60 || item.systolic > 260 || item.diastolic < 30 || item.diastolic > 180);
  if (outOfRange) return "One of the readings is outside the allowed range. Please recheck it.";
  if (measurements.some((item) => item.systolic <= item.diastolic)) {
    return "Each systolic number should usually be higher than its diastolic number. Please recheck the entries.";
  }
  return "";
}

function normalizedRawReadings(reading) {
  if (Array.isArray(reading.rawReadings) && reading.rawReadings.length) {
    return reading.rawReadings.map((item, index) => ({
      number: item.number || index + 1,
      systolic: Number(item.systolic),
      diastolic: Number(item.diastolic),
    }));
  }
  return [{ number: 1, systolic: reading.systolic, diastolic: reading.diastolic }];
}

function rawReadingText(reading) {
  return normalizedRawReadings(reading)
    .map((item) => `R${item.number}: ${item.systolic}/${item.diastolic}`)
    .join(" | ");
}

function updateLiveAverage() {
  const measurements = collectMeasurementSet();
  const valid = !validateMeasurementSet(measurements);
  const sys = $("#averageSystolic");
  const dia = $("#averageDiastolic");
  if (!valid) {
    sys.value = "";
    dia.value = "";
    return;
  }
  const average = averageMeasurementSet(measurements);
  sys.value = average.systolic;
  dia.value = average.diastolic;
}

function renderMeasurementRows(count = measurementCount, existingValues = collectMeasurementSet()) {
  measurementCount = Math.min(MAX_MEASUREMENTS, Math.max(MIN_MEASUREMENTS, count));
  const placeholders = [
    { systolic: 160, diastolic: 89 },
    { systolic: 158, diastolic: 88 },
    { systolic: 156, diastolic: 87 },
    { systolic: 155, diastolic: 86 },
  ];

  els.measurementRows.innerHTML = Array.from({ length: measurementCount }, (_item, index) => {
    const number = index + 1;
    const existing = existingValues[index] || {};
    const placeholder = placeholders[index] || placeholders.at(-1);
    const systolicValue = Number.isFinite(existing.systolic) ? existing.systolic : "";
    const diastolicValue = Number.isFinite(existing.diastolic) ? existing.diastolic : "";
    return `<div class="reading-row measurement-row">
      <strong>${number}</strong>
      <input data-field="systolic" name="systolic${number}" type="number" min="60" max="260" placeholder="${placeholder.systolic}" value="${systolicValue}" required />
      <input data-field="diastolic" name="diastolic${number}" type="number" min="30" max="180" placeholder="${placeholder.diastolic}" value="${diastolicValue}" required />
    </div>`;
  }).join("");

  $("#removeMeasurement").disabled = measurementCount <= MIN_MEASUREMENTS;
  $("#addMeasurement").disabled = measurementCount >= MAX_MEASUREMENTS;
  updateLiveAverage();
}

function setAlert(element, message, tone = "") {
  element.textContent = message;
  element.className = `inline-alert ${tone}`.trim();
}

function readConfig() {
  const fileConfig = window.BP_LOG_CONFIG || {};
  if (fileConfig.supabaseUrl && fileConfig.supabaseAnonKey) {
    return {
      url: fileConfig.supabaseUrl,
      anonKey: fileConfig.supabaseAnonKey,
      source: "file",
    };
  }
  try {
    return {
      ...JSON.parse(localStorage.getItem(CONFIG_KEY) || "{}"),
      source: "browser",
    };
  } catch {
    return {};
  }
}

function saveConfig(config) {
  localStorage.setItem(CONFIG_KEY, JSON.stringify(config));
}

function initializeSupabase() {
  const config = readConfig();
  els.supabaseUrl.value = config.url || "";
  els.supabaseKey.value = config.anonKey || "";

  if (!config.url || !config.anonKey || !window.supabase) {
    supabaseClient = null;
    updateSyncStatus();
    showAuthRedirectWithoutConfig();
    return;
  }

  supabaseClient = window.supabase.createClient(config.url, config.anonKey, {
    auth: {
      autoRefreshToken: true,
      detectSessionInUrl: true,
      persistSession: true,
    },
  });
  handleAuthRedirect().then(() => supabaseClient.auth.getSession()).then(({ data }) => {
    supabaseSession = data.session;
    updateSyncStatus();
    if (supabaseSession) syncNow();
  }).catch((error) => {
    setAlert(els.settingsAlert, error.message, "bad");
    updateSyncStatus("Login failed");
  });
  supabaseClient.auth.onAuthStateChange((_event, session) => {
    supabaseSession = session;
    updateSyncStatus();
    if (session) syncNow();
  });
}

function currentAuthParams() {
  const params = new URLSearchParams(window.location.search);
  const hash = window.location.hash.startsWith("#") ? window.location.hash.slice(1) : window.location.hash;
  const hashParams = new URLSearchParams(hash);
  return { params, hashParams };
}

function hasAuthCallbackParams() {
  const { params, hashParams } = currentAuthParams();
  return AUTH_CALLBACK_KEYS.some((key) => params.has(key) || hashParams.has(key));
}

function cleanAuthCallbackUrl() {
  if (!hasAuthCallbackParams()) return;
  window.history.replaceState({}, document.title, window.location.pathname);
}

function showAuthRedirectWithoutConfig() {
  if (!hasAuthCallbackParams()) return;
  const { params, hashParams } = currentAuthParams();
  const error = params.get("error_description") || hashParams.get("error_description");
  if (error) {
    setAlert(els.settingsAlert, decodeURIComponent(error.replaceAll("+", " ")), "bad");
    return;
  }
  setAlert(els.settingsAlert, "Login link reached the app, but Supabase config is missing in this tab. Add URL/key or fill app-config.js.", "bad");
}

async function handleAuthRedirect() {
  if (!supabaseClient || !hasAuthCallbackParams()) return;
  const { params, hashParams } = currentAuthParams();
  const error = params.get("error_description") || hashParams.get("error_description");
  if (error) {
    cleanAuthCallbackUrl();
    throw new Error(decodeURIComponent(error.replaceAll("+", " ")));
  }
  const code = params.get("code");
  if (code) {
    const { error: exchangeError } = await supabaseClient.auth.exchangeCodeForSession(code);
    cleanAuthCallbackUrl();
    if (exchangeError) throw exchangeError;
    setAlert(els.settingsAlert, "Login confirmed. Syncing now.", "good");
    return;
  }
  setAlert(els.settingsAlert, "Login confirmed. Syncing now.", "good");
}

function updateSyncStatus(message) {
  els.syncStatus.classList.remove("online", "warning");
  const icon = '<i data-lucide="database"></i>';
  if (!supabaseClient) {
    els.syncStatus.innerHTML = `${icon} Local only`;
    els.syncStatus.classList.add("warning");
  } else if (!supabaseSession) {
    els.syncStatus.innerHTML = `${icon} Cloud ready, sign in`;
    els.syncStatus.classList.add("warning");
  } else {
    const pending = readings.filter((reading) => reading.syncState !== "synced").length;
    els.syncStatus.innerHTML = `${icon} ${message || (pending ? `${pending} pending` : "Synced")}`;
    els.syncStatus.classList.add("online");
  }
  if (window.lucide) window.lucide.createIcons();
}

function requireSupabaseAuthInput() {
  if (!supabaseClient) {
    setAlert(els.settingsAlert, "Save Supabase config first.", "bad");
    return null;
  }
  const email = els.loginEmail.value.trim();
  const password = els.loginPassword.value;
  if (!email || !password) {
    setAlert(els.settingsAlert, "Enter email and password.", "bad");
    return null;
  }
  if (password.length < 6) {
    setAlert(els.settingsAlert, "Password must be at least 6 characters.", "bad");
    return null;
  }
  return { email, password };
}

async function signUpWithPassword() {
  const input = requireSupabaseAuthInput();
  if (!input) return;
  const { data, error } = await supabaseClient.auth.signUp({
    email: input.email,
    password: input.password,
    options: { emailRedirectTo: window.location.href.split("#")[0] },
  });
  if (error) {
    setAlert(els.settingsAlert, error.message, "bad");
    return;
  }
  if (data.session) {
    supabaseSession = data.session;
    setAlert(els.settingsAlert, "Account created and signed in. Syncing now.", "good");
    await syncNow();
    return;
  }
  setAlert(els.settingsAlert, "Account created. Check email once to confirm, then sign in with password.", "good");
}

async function signInWithPassword() {
  const input = requireSupabaseAuthInput();
  if (!input) return;
  const { data, error } = await supabaseClient.auth.signInWithPassword({
    email: input.email,
    password: input.password,
  });
  if (error) {
    setAlert(els.settingsAlert, error.message, "bad");
    return;
  }
  supabaseSession = data.session;
  setAlert(els.settingsAlert, "Signed in. Syncing now.", "good");
  await syncNow();
}

async function saveReadingFromForm(event) {
  event.preventDefault();
  const date = $("#readingDate").value;
  const time = $("#readingTime").value;
  const takenAt = selectedReadingDateTime();
  const slot = $("#readingSlot").value;
  const pulseValue = $("#pulse").value.trim();
  const pulse = pulseValue ? Number(pulseValue) : null;
  const rawReadings = collectMeasurementSet();
  const validationError = validateMeasurementSet(rawReadings);

  if (!date || !time) {
    setAlert(els.formAlert, "Enter date and time.", "bad");
    return;
  }

  if (!takenAt) {
    setAlert(els.formAlert, "Enter a valid date and time.", "bad");
    return;
  }

  if (isFutureReadingTime(takenAt)) {
    setAlert(els.formAlert, "Future readings are not allowed. Select a past time.", "bad");
    updateDateTimeLimits();
    return;
  }

  if (pulseValue && (!Number.isFinite(pulse) || pulse < 30 || pulse > 220)) {
    setAlert(els.formAlert, "Pulse must be between 30 and 220, or left blank.", "bad");
    return;
  }

  if (validationError) {
    setAlert(els.formAlert, validationError, "bad");
    return;
  }

  if (hasReadingForDateSlot(readings, date, slot)) {
    setAlert(els.formAlert, `${slot} is already saved for ${formatDay(takenAt)}. Choose another date or slot.`, "bad");
    return;
  }

  const average = averageMeasurementSet(rawReadings);
  const reading = {
    id: uuid(),
    takenAt: takenAt.toISOString(),
    slot,
    systolic: average.systolic,
    diastolic: average.diastolic,
    rawReadings,
    pulse,
    notes: $("#notes").value.trim(),
    syncState: "pending",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  await putReading(reading);
  await refreshReadings();
  els.form.reset();
  renderMeasurementRows(DEFAULT_MEASUREMENTS, []);
  setDefaultFormValues();
  updateLiveAverage();
  setAlert(els.formAlert, `Saved average ${average.systolic}/${average.diastolic}. ${rawReadings.length} reading${rawReadings.length === 1 ? "" : "s"} stored.`, "good");
  syncNow();
}

async function refreshReadings() {
  readings = (await getAllReadings()).sort(compareReadingsOldestFirst);
  renderAll();
}

function renderAll() {
  renderToday();
  renderRawTable();
  renderSummary();
  renderStats();
  renderChart();
  updateSyncStatus();
}

function renderToday() {
  const now = new Date();
  const today = localDateString(now);
  els.todayTitle.textContent = formatDay(now);
  els.todaySubtitle.textContent = "Track morning, evening, and night sessions.";

  els.slotStatus.innerHTML = SLOTS.map((slot) => {
    const found = readings
      .filter((reading) => localDateString(new Date(reading.takenAt)) === today && reading.slot === slot)
      .sort(compareReadingsNewestFirst)[0];
    return `<div class="slot-chip ${found ? "done" : ""}">
      <strong>${slot}</strong>
      <span>${found ? `Avg ${found.systolic}/${found.diastolic} at ${new Date(found.takenAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}` : "Not added yet"}</span>
    </div>`;
  }).join("");
}

function renderSummary() {
  const latest = [...readings].sort(compareReadingsNewestFirst)[0];
  if (!latest) {
    els.lastCategory.textContent = "No readings yet";
    els.lastCategoryText.textContent = "A clinician should interpret patterns, especially for a 17-year-old.";
    return;
  }
  const category = categoryFor(latest.systolic, latest.diastolic);
  els.lastCategory.textContent = `${latest.systolic}/${latest.diastolic} - ${category.label}`;
  els.lastCategoryText.textContent = category.text;
}

function renderRawTable() {
  const newest = [...readings].sort(compareReadingsNewestFirst);
  if (!newest.length) {
    els.rawTable.innerHTML = `<tr><td colspan="7" class="empty-state">No raw data saved yet.</td></tr>`;
    return;
  }

  els.rawTable.innerHTML = newest.map((reading) => {
    const category = categoryFor(reading.systolic, reading.diastolic);
    const rawRows = normalizedRawReadings(reading)
      .map((item) => `<span class="raw-reading-chip">R${item.number}: ${item.systolic}/${item.diastolic}</span>`)
      .join("");
    return `<tr>
      <td>${formatDateTime(reading.takenAt)}</td>
      <td>${reading.slot}</td>
      <td class="bp-value">${reading.systolic}/${reading.diastolic}</td>
      <td><div class="raw-reading-list">${rawRows}</div></td>
      <td>${reading.pulse || "-"}</td>
      <td>${reading.notes ? escapeHtml(reading.notes) : "-"}</td>
      <td><span class="category-badge ${category.key}">${category.label}</span></td>
    </tr>`;
  }).join("");
}

function renderStats() {
  if (!readings.length) {
    els.statsGrid.innerHTML = "";
    return;
  }
  const lastSeven = readings.filter((reading) => Date.now() - new Date(reading.takenAt).getTime() <= 7 * 24 * 60 * 60 * 1000);
  const group = lastSeven.length ? lastSeven : readings;
  const avgSys = Math.round(group.reduce((sum, item) => sum + item.systolic, 0) / group.length);
  const avgDia = Math.round(group.reduce((sum, item) => sum + item.diastolic, 0) / group.length);
  const maxSys = Math.max(...group.map((item) => item.systolic));
  const maxDia = Math.max(...group.map((item) => item.diastolic));
  const highCount = group.filter((item) => item.systolic >= 130 || item.diastolic >= 80).length;

  els.statsGrid.innerHTML = [
    ["Average", `${avgSys}/${avgDia}`, `${group.length} reading${group.length === 1 ? "" : "s"} in view`],
    ["Highest", `${maxSys}/${maxDia}`, "Highest systolic and diastolic in view"],
    ["At/above 130/80", `${highCount}`, "Readings at common hypertension reference"],
    ["Total saved", `${readings.length}`, "Stored in this browser database"],
  ].map(([label, value, sub]) => `<div class="stat-card"><p class="panel-label">${label}</p><strong>${value}</strong><span>${sub}</span></div>`).join("");
}

function escapeHtml(value) {
  return value.replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;",
  })[char]);
}

const baselinePlugin = {
  id: "bpBaselines",
  beforeDatasetsDraw(chartInstance) {
    const { ctx, chartArea, scales } = chartInstance;
    if (!chartArea || !scales.y) return;

    const bands = [
      { from: 0, to: 120, color: "rgba(31, 138, 91, 0.07)" },
      { from: 120, to: 130, color: "rgba(201, 133, 16, 0.09)" },
      { from: 130, to: 140, color: "rgba(226, 112, 34, 0.09)" },
      { from: 140, to: 220, color: "rgba(201, 69, 69, 0.08)" },
    ];

    ctx.save();
    bands.forEach((band) => {
      const yTop = scales.y.getPixelForValue(band.to);
      const yBottom = scales.y.getPixelForValue(band.from);
      ctx.fillStyle = band.color;
      ctx.fillRect(chartArea.left, yTop, chartArea.right - chartArea.left, yBottom - yTop);
    });

    [
      { value: 80, label: "DBP 80", color: "#2d64b3" },
      { value: 90, label: "DBP 90", color: "#2d64b3" },
      { value: 120, label: "SBP 120", color: "#1f8a5b" },
      { value: 130, label: "SBP 130", color: "#c98510" },
      { value: 140, label: "SBP 140", color: "#c94545" },
    ].forEach((line) => {
      const y = scales.y.getPixelForValue(line.value);
      if (y < chartArea.top || y > chartArea.bottom) return;
      ctx.beginPath();
      ctx.setLineDash([6, 5]);
      ctx.strokeStyle = line.color;
      ctx.lineWidth = 1;
      ctx.moveTo(chartArea.left, y);
      ctx.lineTo(chartArea.right, y);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = line.color;
      ctx.font = "700 11px system-ui";
      ctx.fillText(line.label, chartArea.left + 8, y - 5);
    });
    ctx.restore();
  },
};

function renderChart(range = getActiveRange()) {
  const canvas = $("#bpChart");
  if (!canvas || !window.Chart) return;
  registerChartPlugins();

  const points = readings.map((reading) => ({
    x: new Date(reading.takenAt).getTime(),
    ySys: reading.systolic,
    yDia: reading.diastolic,
    slot: reading.slot,
    pulse: reading.pulse,
  }));

  const data = {
    datasets: [
      {
        label: "Systolic",
        data: points.map((point) => ({ x: point.x, y: point.ySys, slot: point.slot, pulse: point.pulse })),
        borderColor: "#c94545",
        backgroundColor: "#c94545",
        pointRadius: 4,
        pointHoverRadius: 7,
        tension: 0.28,
      },
      {
        label: "Diastolic",
        data: points.map((point) => ({ x: point.x, y: point.yDia, slot: point.slot, pulse: point.pulse })),
        borderColor: "#2d64b3",
        backgroundColor: "#2d64b3",
        pointRadius: 4,
        pointHoverRadius: 7,
        tension: 0.28,
      },
    ],
  };

  const bounds = chartBounds(points, range);
  const options = {
    responsive: true,
    maintainAspectRatio: false,
    parsing: false,
    interaction: { mode: "nearest", intersect: false },
    plugins: {
      legend: { display: false },
      tooltip: {
        callbacks: {
          title: (items) => formatDateTime(items[0].parsed.x),
          afterBody: (items) => {
            const raw = items[0].raw;
            return [`Slot: ${raw.slot}`, raw.pulse ? `Pulse: ${raw.pulse}` : ""].filter(Boolean);
          },
        },
      },
      zoom: {
        pan: { enabled: true, mode: "x" },
        zoom: {
          wheel: { enabled: true },
          pinch: { enabled: true },
          mode: "x",
        },
        limits: {
          x: { min: bounds.fullMin, max: bounds.fullMax, minRange: 6 * 60 * 60 * 1000 },
          y: { min: 40, max: 220 },
        },
      },
    },
    scales: {
      x: {
        type: "linear",
        min: bounds.min,
        max: bounds.max,
        grid: { color: "rgba(97,112,106,0.16)" },
        ticks: {
          callback: (value) => new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" }).format(new Date(value)),
          maxTicksLimit: 8,
        },
      },
      y: {
        min: 40,
        max: 220,
        title: { display: true, text: "mmHg" },
        grid: { color: "rgba(97,112,106,0.16)" },
      },
    },
  };

  if (chart) {
    chart.data = data;
    chart.options = options;
    chart.update();
    return;
  }

  chart = new Chart(canvas, {
    type: "line",
    data,
    options,
  });
}

function registerChartPlugins() {
  if (chartPluginsRegistered) return;
  const plugins = [baselinePlugin];
  const zoomPlugin = window.ChartZoom || window.chartjsPluginZoom || window["chartjs-plugin-zoom"];
  if (zoomPlugin) plugins.push(zoomPlugin);
  Chart.register(...plugins);
  chartPluginsRegistered = true;
}

function chartBounds(points, range) {
  const now = Date.now();
  const fallbackMin = now - 14 * 24 * 60 * 60 * 1000;
  const fallbackMax = now;
  if (!points.length) return { min: fallbackMin, max: fallbackMax, fullMin: fallbackMin, fullMax: fallbackMax };

  const xs = points.map((point) => point.x);
  const fullMin = Math.min(...xs) - 12 * 60 * 60 * 1000;
  const fullMax = Math.max(...xs) + 12 * 60 * 60 * 1000;
  if (range === "all") return { min: fullMin, max: fullMax, fullMin, fullMax };

  const days = Number(range || 14);
  const max = fullMax;
  const min = Math.max(fullMin, max - days * 24 * 60 * 60 * 1000);
  return { min, max, fullMin, fullMax };
}

function getActiveRange() {
  return $(".segmented button.active")?.dataset.range || "14";
}

async function syncNow() {
  if (!supabaseClient || !supabaseSession) {
    updateSyncStatus();
    return;
  }

  updateSyncStatus("Syncing...");
  const pending = readings.filter((reading) => reading.syncState !== "synced");
  if (pending.length) {
    const rows = pending.map((reading) => ({
      id: reading.id,
      taken_at: reading.takenAt,
      slot: reading.slot,
      systolic: reading.systolic,
      diastolic: reading.diastolic,
      pulse: reading.pulse,
      notes: reading.notes,
      raw_readings: normalizedRawReadings(reading),
      updated_at: reading.updatedAt,
    }));
    const { error } = await supabaseClient.from("bp_readings").upsert(rows, { onConflict: "id" });
    if (error) {
      setAlert(els.settingsAlert, error.message, "bad");
      updateSyncStatus("Sync failed");
      return;
    }
    for (const reading of pending) {
      await putReading({ ...reading, syncState: "synced" });
    }
  }

  const { data, error } = await supabaseClient
    .from("bp_readings")
    .select("id,taken_at,slot,systolic,diastolic,pulse,notes,raw_readings,created_at,updated_at")
    .order("taken_at", { ascending: true });
  if (error) {
    setAlert(els.settingsAlert, error.message, "bad");
    updateSyncStatus("Sync failed");
    return;
  }

  for (const row of data || []) {
    const existing = readings.find((reading) => reading.id === row.id);
    const localUpdated = existing ? new Date(existing.updatedAt || 0).getTime() : 0;
    const remoteUpdated = new Date(row.updated_at || row.created_at || 0).getTime();
    if (!existing || remoteUpdated >= localUpdated) {
      await putReading({
        id: row.id,
        takenAt: row.taken_at,
        slot: row.slot,
        systolic: row.systolic,
        diastolic: row.diastolic,
        rawReadings: row.raw_readings || [{ number: 1, systolic: row.systolic, diastolic: row.diastolic }],
        pulse: row.pulse,
        notes: row.notes || "",
        syncState: "synced",
        createdAt: row.created_at || row.updated_at || new Date().toISOString(),
        updatedAt: row.updated_at || row.created_at || new Date().toISOString(),
      });
    }
  }

  setAlert(els.settingsAlert, "Sync complete.", "good");
  await refreshReadings();
}

function exportCsv() {
  const header = ["taken_at", "slot", "average_systolic", "average_diastolic", "raw_readings", "pulse", "notes"];
  const rows = readings.map((reading) => [
    reading.takenAt,
    reading.slot,
    reading.systolic,
    reading.diastolic,
    rawReadingText(reading),
    reading.pulse || "",
    reading.notes || "",
  ]);
  downloadFile("bp-readings.csv", [header, ...rows].map((row) => row.map(csvCell).join(",")).join("\n"), "text/csv");
}

function csvCell(value) {
  return `"${String(value).replaceAll('"', '""')}"`;
}

function exportJson() {
  const payload = {
    exportedAt: new Date().toISOString(),
    readings,
  };
  downloadFile("bp-readings-backup.json", JSON.stringify(payload, null, 2), "application/json");
}

function downloadFile(filename, content, type) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

async function importJson(file) {
  if (!file) return;
  const text = await file.text();
  const payload = JSON.parse(text);
  const imported = Array.isArray(payload) ? payload : payload.readings;
  if (!Array.isArray(imported)) throw new Error("Backup file does not contain readings.");
  const importedReadings = [...readings];
  let importedCount = 0;
  let skippedDuplicates = 0;
  for (const reading of imported) {
    if (reading.id && reading.takenAt && reading.systolic && reading.diastolic) {
      const slot = reading.slot || slotForTimeString(new Date(reading.takenAt).toTimeString().slice(0, 5));
      const date = readingLocalDate(reading);
      if (slot && hasReadingForDateSlot(importedReadings, date, slot)) {
        skippedDuplicates += 1;
        continue;
      }
      await putReading({
        ...reading,
        rawReadings: normalizedRawReadings(reading),
        syncState: reading.syncState || "pending",
        slot,
      });
      importedReadings.push({ ...reading, slot });
      importedCount += 1;
    }
  }
  await refreshReadings();
  const duplicateNote = skippedDuplicates ? ` Skipped ${skippedDuplicates} duplicate date/slot reading${skippedDuplicates === 1 ? "" : "s"}.` : "";
  setAlert(els.settingsAlert, `Imported ${importedCount} reading${importedCount === 1 ? "" : "s"}.${duplicateNote}`, "good");
}

function setDefaultFormValues() {
  const now = new Date();
  $("#readingDate").value = localDateString(now);
  $("#readingTime").value = localTimeString(now);
  updateDateTimeLimits();
  updateLiveAverage();
}

function wireEvents() {
  els.form.addEventListener("submit", saveReadingFromForm);
  $("#readingDate").addEventListener("input", () => updateDateTimeLimits());
  $("#readingTime").addEventListener("input", () => updateDateTimeLimits({ shiftFutureTime: true }));
  els.measurementRows.addEventListener("input", updateLiveAverage);
  $("#addMeasurement").addEventListener("click", () => {
    renderMeasurementRows(measurementCount + 1);
  });
  $("#removeMeasurement").addEventListener("click", () => {
    renderMeasurementRows(measurementCount - 1);
  });

  $$(".tab-button").forEach((button) => {
    button.addEventListener("click", () => {
      $$(".tab-button").forEach((item) => item.classList.remove("active"));
      $$(".tab-panel").forEach((item) => item.classList.remove("active"));
      button.classList.add("active");
      $(`#${button.dataset.tab}Panel`).classList.add("active");
      if (button.dataset.tab === "graph" && chart) chart.resize();
    });
  });

  $$(".segmented button").forEach((button) => {
    button.addEventListener("click", () => {
      $$(".segmented button").forEach((item) => item.classList.remove("active"));
      button.classList.add("active");
      renderChart(button.dataset.range);
    });
  });

  $("#resetZoom").addEventListener("click", () => {
    if (chart) chart.resetZoom();
    renderChart();
  });

  $("#openSettings").addEventListener("click", () => els.settingsDialog.showModal());

  $("#saveSupabase").addEventListener("click", () => {
    saveConfig({
      url: els.supabaseUrl.value.trim(),
      anonKey: els.supabaseKey.value.trim(),
    });
    initializeSupabase();
    setAlert(els.settingsAlert, "Supabase config saved.", "good");
  });

  $("#signUpPassword").addEventListener("click", signUpWithPassword);
  $("#signInPassword").addEventListener("click", signInWithPassword);

  $("#sendMagicLink").addEventListener("click", async () => {
    if (!supabaseClient) {
      setAlert(els.settingsAlert, "Save Supabase config first.", "bad");
      return;
    }
    const email = els.loginEmail.value.trim();
    if (!email) {
      setAlert(els.settingsAlert, "Enter an email address.", "bad");
      return;
    }
    const { error } = await supabaseClient.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: window.location.href.split("#")[0] },
    });
    setAlert(els.settingsAlert, error ? error.message : "Login link sent. Open it on this device.", error ? "bad" : "good");
  });

  $("#signOut").addEventListener("click", async () => {
    if (supabaseClient) await supabaseClient.auth.signOut();
    setAlert(els.settingsAlert, "Signed out.", "good");
  });

  $("#syncNow").addEventListener("click", syncNow);
  $("#exportCsv").addEventListener("click", exportCsv);
  $("#exportJson").addEventListener("click", exportJson);
  $("#importJson").addEventListener("change", (event) => {
    importJson(event.target.files[0]).catch((error) => setAlert(els.settingsAlert, error.message, "bad"));
  });

  window.addEventListener("online", syncNow);
}

async function init() {
  db = await openDb();
  renderMeasurementRows();
  setDefaultFormValues();
  wireEvents();
  initializeSupabase();
  await refreshReadings();
  if (window.lucide) window.lucide.createIcons();
}

init().catch((error) => {
  console.error(error);
  setAlert(els.formAlert, error.message, "bad");
});
