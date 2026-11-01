// ===== Сторінка «Впорядкування результатів» =====
// Дані генеруються локально (немає сервера): 486 відповідей, перші 8 — як у макеті.

const PAGE_SIZE = 8;
const MONTHS = ["січ.", "лют.", "бер.", "квіт.", "трав.", "черв.", "лип.", "серп.", "вер.", "жовт.", "лист.", "груд."];
const FREQ = ["Раз на тиждень", "Кілька разів на тиждень", "Кілька разів на місяць"];
const CHANNELS = ["Смартфон", "Комп’ютер", "Планшет"];
const CITIES = ["Київ", "Львів", "Одеса", "Харків", "Дніпро"];
const AGE_GROUPS = ["18–24", "25–34", "35–44", "45+"];

// Запитання для групування та розрахунків
const QUESTIONS = {
  age: { label: "Вік, роки", numeric: true },
  sat: { label: "Задоволеність (1–5)", numeric: true },
  time: { label: "Час проходження, с", numeric: true },
  freq: { label: "Частота покупок" },
  channel: { label: "Канал" },
  city: { label: "Місто (відкрите запитання)" },
};
const GROUPABLE = ["freq", "channel", "city"];

const $ = (id) => document.getElementById(id);
if (!$("rows")) throw new Error("Це не сторінка результатів");

// ---------- Допоміжні функції ----------
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
const norm = (s) => String(s).trim().replace(/\s+/g, " ").toLowerCase(); // ігноруємо регістр і зайві пробіли
const canon = (n) => n.charAt(0).toUpperCase() + n.slice(1);
const fmtNum = (n) => n.toLocaleString("uk-UA", { maximumFractionDigits: 2 });
const ageGroup = (age) => (age < 25 ? "18–24" : age < 35 ? "25–34" : age < 45 ? "35–44" : "45+");
const pad2 = (n) => String(n).padStart(2, "0");
const fmtDate = (ts) => {
  const d = new Date(ts);
  return `${d.getDate()} ${MONTHS[d.getMonth()]}, ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
};
const fmtDuration = (sec) => `${Math.floor(sec / 60)} хв ${pad2(Math.round(sec % 60))} с`;

// Генератор псевдовипадкових чисел (щоб дані були однакові при кожному запуску)
function makeRng(seed) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = makeRng(2610);
const pick = (arr, weights) => {
  if (!weights) return arr[Math.floor(rand() * arr.length)];
  let r = rand() * weights.reduce((a, b) => a + b, 0);
  for (let i = 0; i < arr.length; i++) {
    r -= weights[i];
    if (r < 0) return arr[i];
  }
  return arr[arr.length - 1];
};
const randBetween = (a, b) => a + Math.floor(rand() * (b - a + 1));
const cityVariant = (c) => {
  const r = rand();
  return r < 0.6 ? c : r < 0.75 ? c.toUpperCase() : r < 0.9 ? c.toLowerCase() : `  ${c} `;
};

// ---------- Генерація даних ----------
const END = new Date(2026, 9, 23, 10, 42).getTime(); // «зараз» у системі
let nowTs = END;
const DAY = 24 * 3600 * 1000;

function makeRow(id, group, ts, o = {}) {
  const [min, max] = { "18–24": [18, 24], "25–34": [25, 34], "35–44": [35, 44], "45+": [45, 68] }[group];
  return {
    id,
    age: o.age ?? randBetween(min, max),
    gender: pick(["Жіноча", "Чоловіча"], [55, 45]),
    freq: o.freq ?? pick(FREQ, [55, 30, 15]),
    channel: o.channel ?? pick(CHANNELS, [74, 21, 5]),
    sat: o.sat !== undefined ? o.sat : rand() < 0.04 ? null : pick([1, 2, 3, 4, 5], [3, 5, 10, 35, 47]), // null — необов’язкове поле
    city: cityVariant(pick(CITIES)),
    time: o.time ?? randBetween(120, 420),
    ts,
  };
}

function buildData() {
  const T = (h, m) => new Date(2026, 9, 23, h, m).getTime();
  // Перші 8 відповідей — як у макеті
  const fixed = [
    [486, 29, "Раз на тиждень", "Смартфон", 5, T(10, 42)],
    [485, 21, "Кілька разів на тиждень", "Смартфон", 4, T(10, 36)],
    [484, 38, "Кілька разів на місяць", "Комп’ютер", 5, T(10, 28)],
    [483, 27, "Раз на тиждень", "Смартфон", 4, T(10, 15)],
    [482, 52, "Раз на тиждень", "Комп’ютер", 3, T(9, 58)],
    [481, 31, "Кілька разів на тиждень", "Смартфон", 5, T(9, 47)],
    [480, 40, "Кілька разів на місяць", "Планшет", 4, T(9, 31)],
    [479, 20, "Раз на тиждень", "Смартфон", 5, T(9, 20)],
  ];
  const quota = { "18–24": 112, "25–34": 184, "35–44": 126, "45+": 64 }; // як на сторінці сегментів
  const rows = fixed.map(([id, age, freq, channel, sat, ts]) => {
    quota[ageGroup(age)]--;
    return makeRow(id, ageGroup(age), ts, { age, freq, channel, sat });
  });

  // Решта груп перемішується (Фішер–Єйтс)
  const pool = Object.entries(quota).flatMap(([g, n]) => Array(n).fill(g));
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }

  // Дати: 116 відповідей за останні 7 днів (разом з першими 8 — 124), решта — раніше
  const spread = (n, from, to) => Array.from({ length: n }, () => from + rand() * (to - from)).sort((a, b) => b - a);
  const weekAgo = END - 7 * DAY;
  const dates = [
    ...spread(116, weekAgo + 60000, T(9, 20) - 60000),
    ...spread(362, new Date(2026, 8, 1).getTime(), weekAgo - 60000),
  ].map(Math.round);
  for (let k = 0; k < pool.length; k++) rows.push(makeRow(478 - k, pool[k], dates[k]));

  // Середній час проходження — рівно 4 хв 32 с (272 с)
  const diff = 272 * rows.length - rows.reduce((s, r) => s + r.time, 0);
  const base = Math.trunc(diff / rows.length);
  rows.forEach((r) => (r.time += base));
  for (let i = 0; i < Math.abs(diff - base * rows.length); i++) rows[i].time += Math.sign(diff);
  return rows;
}

let data = buildData();
let nextId = 487;

// ---------- Стан ----------
const DEFAULT_SORT = [{ key: "date", dir: "desc" }];
const state = {
  sort: [...DEFAULT_SORT],
  search: "",
  gender: "",
  age: "",
  freq: "",
  channel: "",
  sat: "",
  city: "",
  from: "", // діапазон дат (рядки yyyy-mm-dd)
  to: "",
  page: 1,
  selected: new Set(),
  groups: { freq: [], channel: [], city: [] }, // ручні групи: { name, members: [norm] }
  calc: null,
  flashId: null,
};

// Значення відповіді з урахуванням груп і автооб’єднання однакових
function show(row, q) {
  const n = norm(row[q]);
  const g = state.groups[q].find((x) => x.members.includes(n));
  return g ? g.name : canon(n);
}

const SORT_VALUE = {
  id: (r) => r.id,
  age: (r) => r.age,
  freq: (r) => show(r, "freq"),
  channel: (r) => show(r, "channel"),
  sat: (r) => r.sat,
  date: (r) => r.ts,
};

function compare(a, b) {
  for (const { key, dir } of state.sort) {
    const x = SORT_VALUE[key](a);
    const y = SORT_VALUE[key](b);
    const xEmpty = x == null || x === "";
    const yEmpty = y == null || y === "";
    if (xEmpty && yEmpty) continue;
    if (xEmpty) return 1; // порожні значення завжди внизу
    if (yEmpty) return -1;
    const c = typeof x === "string" ? x.localeCompare(y, "uk") : x - y;
    if (c) return dir === "asc" ? c : -c;
  }
  return b.id - a.id;
}

// Фільтри за значенням: ключ = ключ у state та id поля f-<ключ>
const FILTERS = {
  gender: { label: "Стать", test: (r, v) => r.gender === v },
  age: { label: "Вік", test: (r, v) => ageGroup(r.age) === v },
  freq: { label: "Частота", test: (r, v) => norm(r.freq) === norm(v) },
  channel: { label: "Канал", test: (r, v) => norm(r.channel) === norm(v) },
  sat: { label: "Задоволеність", test: (r, v) => (v === "none" ? r.sat == null : r.sat === Number(v)), text: (v) => (v === "none" ? "без оцінки" : `${v} із 5`) },
  city: { label: "Місто", test: (r, v) => norm(r.city) === norm(v) },
};

// Діапазон дат; якщо початок пізніше за кінець — діапазон не застосовується
const dateError = () => !!(state.from && state.to && state.from > state.to);
function dateRange() {
  if ((!state.from && !state.to) || dateError()) return null;
  const a = state.from ? new Date(`${state.from}T00:00:00`).getTime() : -Infinity;
  const b = state.to ? new Date(`${state.to}T23:59:59`).getTime() : Infinity;
  return [a, b];
}

function matches(r) {
  for (const [key, f] of Object.entries(FILTERS)) if (state[key] && !f.test(r, state[key])) return false;
  const range = dateRange();
  if (range && (r.ts < range[0] || r.ts > range[1])) return false;
  const q = norm(state.search);
  if (q) {
    const hay = norm(`${String(r.id).padStart(5, "0")} ${r.id} ${show(r, "freq")} ${show(r, "channel")} ${show(r, "city")}`);
    if (!hay.includes(q)) return false;
  }
  return true;
}

const getView = () => data.filter(matches).sort(compare);

// ---------- Відображення ----------
function renderRows(view) {
  const start = (state.page - 1) * PAGE_SIZE;
  const slice = view.slice(start, start + PAGE_SIZE);
  $("rows").innerHTML = slice
    .map((r) => {
      const sel = state.selected.has(r.id);
      return `<tr class="${sel ? "selected" : ""} ${r.id === state.flashId ? "row-new" : ""}">
        <td><label class="row-id"><input type="checkbox" class="row-check" data-id="${r.id}" ${sel ? "checked" : ""}><span>№ ${String(r.id).padStart(5, "0")}</span></label></td>
        <td>${ageGroup(r.age)}</td>
        <td>${esc(show(r, "freq"))}</td>
        <td>${esc(show(r, "channel"))}</td>
        <td class="sat">${r.sat == null ? "—" : `${r.sat} із 5`}</td>
        <td>${fmtDate(r.ts)}</td>
      </tr>`;
    })
    .join("");
  state.flashId = null;
}

function renderPagination(total) {
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const p = state.page;
  const set = new Set([1, pages, p - 1, p, p + 1]);
  if (p <= 3) [2, 3].forEach((n) => set.add(n));
  const list = [...set].filter((n) => n >= 1 && n <= pages).sort((a, b) => a - b);
  let html = `<button class="page-btn" data-page="${p - 1}" ${p === 1 ? "disabled" : ""}>Назад</button>`;
  list.forEach((n, i) => {
    if (i && n - list[i - 1] > 1) html += `<span class="page-gap">···</span>`;
    html += `<button class="page-btn ${n === p ? "active" : ""}" data-page="${n}">${n}</button>`;
  });
  html += `<button class="page-btn" data-page="${p + 1}" ${p === pages ? "disabled" : ""}>Далі</button>`;
  $("pagination").innerHTML = html;
}

function renderChips(total) {
  const range = state.from || state.to;
  const filtered = state.search || range || Object.keys(FILTERS).some((k) => state[k]);
  const chips = [`<span class="chip">${filtered ? "Знайдено" : "Усі відповіді"} · ${total}</span>`, `<span class="chip">Завершені</span>`];
  const clear = (key) => `<button type="button" data-clear="${key}" aria-label="Прибрати фільтр">×</button>`;
  Object.entries(FILTERS).forEach(([key, f]) => {
    if (state[key]) chips.push(`<span class="chip">${f.label}: ${esc(f.text ? f.text(state[key]) : state[key])}${clear(key)}</span>`);
  });
  if (range && !dateError()) chips.push(`<span class="chip">Дата: ${state.from || "…"} — ${state.to || "…"}${clear("range")}</span>`);
  $("chips").innerHTML = chips.join("");
}

function renderSortUI() {
  document.querySelectorAll(".results-table th[data-sort]").forEach((th) => {
    const i = state.sort.findIndex((s) => s.key === th.dataset.sort);
    th.setAttribute("aria-sort", i < 0 ? "none" : state.sort[i].dir === "asc" ? "ascending" : "descending");
    th.querySelector(".sort-level").textContent = i >= 0 && state.sort.length > 1 ? i + 1 : "";
  });
  const isDefault = state.sort.length === 1 && state.sort[0].key === "date" && state.sort[0].dir === "desc";
  $("sort-reset").hidden = isDefault;
  const preset = state.sort.length === 1 ? `${state.sort[0].key}-${state.sort[0].dir}` : "custom";
  const has = [...$("sort-preset").options].some((o) => o.value === preset);
  $("sort-preset").value = has ? preset : "custom";
}

function renderKpi() {
  $("kpi-total").textContent = data.length;
  $("kpi-new").textContent = data.filter((r) => r.ts >= nowTs - 7 * DAY).length;
  $("kpi-time").textContent = fmtDuration(data.reduce((s, r) => s + r.time, 0) / data.length);
  $("meta-count").textContent = `${data.length} відповідей · 12 запитань`;
}

function refresh() {
  const view = getView();
  const pages = Math.max(1, Math.ceil(view.length / PAGE_SIZE));
  if (state.page > pages) state.page = pages;
  renderRows(view);
  renderPagination(view.length);
  renderChips(view.length);
  renderSortUI();
  renderKpi();

  const empty = view.length === 0;
  $("empty-state").hidden = !empty;
  document.querySelector(".results-table").hidden = empty;
  $("pagination").hidden = empty;
  const from = empty ? 0 : (state.page - 1) * PAGE_SIZE + 1;
  const to = Math.min(state.page * PAGE_SIZE, view.length);
  const sel = state.selected.size ? ` · обрано ${state.selected.size}` : "";
  $("shown").textContent = `Показано ${from}–${to} із ${view.length} відповідей${sel}`;

  fillCalcValues(); // список відповідей для розрахунків залежить від фільтрів
  if (state.calc) runCalc(true); // динамічне перерахування
}

// ---------- Сортування ----------
function toggleSort(key, add) {
  const i = state.sort.findIndex((s) => s.key === key);
  if (add) {
    if (i >= 0) state.sort[i].dir = state.sort[i].dir === "asc" ? "desc" : "asc";
    else state.sort.push({ key, dir: "asc" });
  } else {
    const cur = i === 0 && state.sort.length === 1 ? state.sort[0].dir : null;
    state.sort = [{ key, dir: cur === "asc" ? "desc" : "asc" }];
  }
  state.page = 1;
  refresh();
}

document.querySelector(".results-table thead").addEventListener("click", (e) => {
  const th = e.target.closest("th[data-sort]");
  if (th) toggleSort(th.dataset.sort, e.shiftKey);
});
$("sort-reset").addEventListener("click", () => {
  state.sort = [...DEFAULT_SORT];
  state.page = 1;
  refresh();
});
$("sort-preset").addEventListener("change", (e) => {
  const [key, dir] = e.target.value.split("-");
  if (key === "custom") return;
  state.sort = [{ key, dir }];
  state.page = 1;
  refresh();
});

// ---------- Пошук, фільтри, пагінація ----------
$("search").addEventListener("input", (e) => {
  state.search = e.target.value;
  state.page = 1;
  refresh();
});
$("filters-toggle").addEventListener("click", () => {
  const open = $("filters-panel").hidden;
  $("filters-panel").hidden = !open;
  $("filters-toggle").setAttribute("aria-expanded", String(open));
});
const setFilter = (key, val) => {
  state[key] = val;
  state.page = 1;
  refresh();
};
Object.keys(FILTERS).forEach((key) => $(`f-${key}`).addEventListener("change", (e) => setFilter(key, e.target.value)));

// Діапазон дат з перевіркою коректності
function onDates() {
  state.from = $("f-from").value;
  state.to = $("f-to").value;
  const bad = dateError();
  $("f-from").classList.toggle("invalid", bad);
  $("f-to").classList.toggle("invalid", bad);
  $("date-error").hidden = !bad;
  state.page = 1;
  refresh();
}
$("f-from").addEventListener("change", onDates);
$("f-to").addEventListener("change", onDates);

function resetFilters() {
  Object.keys(FILTERS).forEach((key) => {
    $(`f-${key}`).value = "";
    state[key] = "";
  });
  $("f-from").value = $("f-to").value = "";
  onDates();
}
$("filters-reset").addEventListener("click", resetFilters);

$("chips").addEventListener("click", (e) => {
  const key = e.target.closest("[data-clear]")?.dataset.clear;
  if (!key) return;
  if (key === "range") {
    $("f-from").value = $("f-to").value = "";
    return onDates();
  }
  $(`f-${key}`).value = "";
  setFilter(key, "");
});
$("pagination").addEventListener("click", (e) => {
  const btn = e.target.closest("[data-page]");
  if (!btn || btn.disabled) return;
  state.page = Number(btn.dataset.page);
  refresh();
});
$("rows").addEventListener("change", (e) => {
  if (!e.target.classList.contains("row-check")) return;
  const id = Number(e.target.dataset.id);
  e.target.checked ? state.selected.add(id) : state.selected.delete(id);
  refresh();
});

// ---------- Нові відповіді в реальному часі ----------
function addResponse() {
  nowTs += randBetween(4, 11) * 60000;
  const row = makeRow(nextId++, pick(AGE_GROUPS, [22, 38, 26, 14]), nowTs);
  data.unshift(row);
  state.flashId = row.id;
  refresh(); // якщо відповідь не підпадає під активний фільтр — список не змінюється
}
$("simulate").addEventListener("click", addResponse);
setInterval(addResponse, 60000); // нова відповідь раз на хвилину (для демонстрації)

// ---------- Експорт (CSV зберігає порядок рядків з екрана) ----------
$("export-btn").addEventListener("click", () => {
  const head = ["№", "Вік", "Вікова група", "Стать", "Частота покупок", "Канал", "Задоволеність", "Місто", "Час, с", "Дата"];
  const lines = getView().map((r) =>
    [r.id, r.age, ageGroup(r.age), r.gender, show(r, "freq"), show(r, "channel"), r.sat ?? "", show(r, "city"), r.time, fmtDate(r.ts)]
      .map((v) => `"${String(v).replace(/"/g, '""')}"`)
      .join(";")
  );
  const blob = new Blob(["\ufeff" + [head.join(";"), ...lines].join("\n")], { type: "text/csv;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "vidpovidi.csv";
  a.click();
  URL.revokeObjectURL(a.href);
});

// ---------- Групування ----------
const dialog = $("group-dialog");
const groupSel = $("group-question");
GROUPABLE.forEach((q) => groupSel.insertAdjacentHTML("beforeend", `<option value="${q}">${QUESTIONS[q].label}</option>`));

// Варіанти відповідей запитання: { label, count, group }
function groupItems(q) {
  const map = new Map();
  data.forEach((r) => {
    const label = show(r, q);
    map.set(label, (map.get(label) || 0) + 1);
  });
  return [...map]
    .map(([label, count]) => ({ label, count, group: state.groups[q].find((g) => g.name === label) }))
    .sort((a, b) => b.count - a.count);
}

function renderGroupList() {
  const q = groupSel.value;
  const items = groupItems(q);
  $("group-list").innerHTML = items
    .map((it, i) => {
      const pct = (it.count / data.length) * 100;
      return `<div class="group-item">
        <input type="checkbox" class="row-check" data-label="${esc(it.label)}" id="gi-${i}">
        <label for="gi-${i}" class="group-label">
          <span>${esc(it.label)}${it.group ? ' <em class="tag-mini">група</em>' : ""}</span>
          <span class="group-bar"><i style="width:${pct.toFixed(1)}%"></i></span>
        </label>
        <span class="group-count">${it.count}</span>
        <span class="group-pct">${fmtNum(pct)}%</span>
        ${it.group ? `<button type="button" class="link-btn" data-ungroup="${esc(it.label)}">Розгрупувати</button>` : "<span></span>"}
      </div>`;
    })
    .join("");
}

function groupError(msg) {
  $("group-error").hidden = !msg;
  $("group-error").textContent = msg || "";
  $("group-name").classList.toggle("invalid", msg === "Вкажіть назву групи");
}

$("group-open").addEventListener("click", () => {
  groupError("");
  renderGroupList();
  dialog.showModal();
});
$("group-close").addEventListener("click", () => dialog.close());
dialog.addEventListener("click", (e) => {
  if (e.target === dialog) dialog.close(); // клік по затемненню
});
groupSel.addEventListener("change", () => {
  $("group-name").value = "";
  groupError("");
  renderGroupList(); // вибір скидається: об’єднувати можна лише в межах одного запитання
});

$("group-create").addEventListener("click", () => {
  const q = groupSel.value;
  const name = $("group-name").value.trim();
  const labels = [...$("group-list").querySelectorAll(".row-check:checked")].map((c) => c.dataset.label);
  if (!name) return groupError("Вкажіть назву групи");
  if (labels.length < 2) return groupError("Оберіть щонайменше два варіанти відповіді");

  // Якщо серед вибраних уже є група — розгортаємо її учасників
  const members = new Set();
  labels.forEach((label) => {
    const g = state.groups[q].find((x) => x.name === label);
    if (g) {
      g.members.forEach((m) => members.add(m));
      state.groups[q] = state.groups[q].filter((x) => x !== g);
    } else members.add(norm(label));
  });
  state.groups[q].push({ name, members: [...members] });
  $("group-name").value = "";
  groupError("");
  renderGroupList();
  fillCalcValues();
  refresh();
});

$("group-list").addEventListener("click", (e) => {
  const label = e.target.closest("[data-ungroup]")?.dataset.ungroup;
  if (!label) return;
  const q = groupSel.value;
  state.groups[q] = state.groups[q].filter((g) => g.name !== label);
  renderGroupList();
  fillCalcValues();
  refresh();
});

// ---------- Розрахунковий скрипт ----------
const NUMERIC_ONLY = ["mean", "median", "std"];
const calcQ = $("calc-question");
const calcMetric = $("calc-metric");
Object.entries(QUESTIONS).forEach(([k, v]) => calcQ.insertAdjacentHTML("beforeend", `<option value="${k}">${v.label}</option>`));

function fillCalcValues() {
  const q = calcQ.value;
  const rows = data.filter(matches);
  const vals = [...new Set(rows.map((r) => (QUESTIONS[q].numeric ? r[q] : show(r, q))).filter((v) => v != null))];
  vals.sort((a, b) => (typeof a === "number" ? a - b : String(a).localeCompare(b, "uk")));
  const prev = $("calc-value").value;
  $("calc-value").innerHTML = vals.map((v) => `<option value="${esc(v)}">${esc(v)}</option>`).join("");
  if (vals.map(String).includes(prev)) $("calc-value").value = prev;
}

function syncCalcControls() {
  const numeric = !!QUESTIONS[calcQ.value].numeric;
  // Для нечислових типів середнє, медіана й відхилення недоступні
  [...calcMetric.options].forEach((o) => (o.disabled = !numeric && NUMERIC_ONLY.includes(o.value)));
  if (calcMetric.selectedOptions[0].disabled) calcMetric.value = "mode";
  $("calc-note").textContent = numeric ? "" : "Середнє значення, медіана та стандартне відхилення доступні лише для числових запитань.";
  $("calc-value-wrap").hidden = !["percent", "count"].includes(calcMetric.value);
  fillCalcValues();
}

function calculate(q, metric, value) {
  const numeric = !!QUESTIONS[q].numeric;
  const rows = data.filter(matches);
  const vals = rows.map((r) => (numeric ? r[q] : show(r, q))).filter((v) => v != null && v !== "");
  const n = vals.length;
  if (!n) throw new Error("empty");
  const mean = () => vals.reduce((a, b) => a + b, 0) / n;
  switch (metric) {
    case "mean":
      return { text: fmtNum(mean()), label: "Середнє значення" };
    case "median": {
      const s = [...vals].sort((a, b) => a - b);
      const m = n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2;
      return { text: fmtNum(m), label: "Медіана" };
    }
    case "mode": {
      const c = new Map();
      vals.forEach((v) => c.set(v, (c.get(v) || 0) + 1));
      const top = Math.max(...c.values());
      const modes = [...c].filter(([, k]) => k === top).map(([v]) => (numeric ? fmtNum(v) : v));
      return { text: modes.join(", "), label: `Мода (зустрічається ${top} р.)` };
    }
    case "std": {
      if (n < 2) throw new Error("few");
      const m = mean();
      const sd = Math.sqrt(vals.reduce((s, v) => s + (v - m) ** 2, 0) / (n - 1));
      return { text: fmtNum(sd), label: "Стандартне відхилення" };
    }
    case "count":
    case "percent": {
      const total = rows.length;
      if (!total) throw new Error("empty");
      const cnt = vals.filter((v) => String(v) === String(value)).length;
      const pct = (cnt / total) * 100;
      return metric === "count"
        ? { text: `${cnt}`, label: `Відповідей «${value}» · ${fmtNum(pct)}% від ${total}` }
        : { text: `${fmtNum(pct)}%`, label: `Відповіді «${value}» · ${cnt} із ${total}` };
    }
  }
}

function runCalc(silent = false) {
  const args = { q: calcQ.value, metric: calcMetric.value, value: $("calc-value").value };
  state.calc = args;
  const box = $("calc-result");
  try {
    const res = calculate(args.q, args.metric, args.value);
    box.className = "calc-result";
    box.innerHTML = `<strong>${esc(res.text)}</strong><span>${esc(res.label)} · ${esc(QUESTIONS[args.q].label)}</span>`;
    if (silent) {
      box.classList.add("updated");
      setTimeout(() => box.classList.remove("updated"), 800);
    }
  } catch {
    // Немає даних або обчислення неможливе — система не падає
    box.className = "calc-result error";
    box.textContent = "Недостатньо даних або неможливо виконати обчислення";
  }
}

calcQ.addEventListener("change", () => {
  state.calc = null;
  $("calc-result").textContent = "";
  syncCalcControls();
});
calcMetric.addEventListener("change", () => {
  $("calc-value-wrap").hidden = !["percent", "count"].includes(calcMetric.value);
});
$("calc-run").addEventListener("click", () => runCalc());

// ---------- Старт ----------
syncCalcControls();
refresh();
