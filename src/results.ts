// ===== Сторінка «Впорядкування результатів» =====
// Відповіді завантажуються з JSON (локального файлу або хмарного сховища).

import { POLL_MS, RESPONSES_URL, SURVEYS_URL } from "./config";
import { loadJson, showLoadError } from "./api";
import type { IResponse } from "./model/iresponse";
import type { ISurvey } from "./model/isurvey";
import type { AgeGroup, Channel, Frequency } from "./model/type";

// ---------- Типи ----------
interface Row extends IResponse {
  ts: number; // дата у мілісекундах (для сортування)
}
type SortKey = "id" | "name" | "age" | "freq" | "channel" | "sat" | "repeat" | "date";
type SortDir = "asc" | "desc";
interface SortLevel {
  key: SortKey;
  dir: SortDir;
}
type GroupKey = "freq" | "channel" | "city" | "name" | "repeat";
type QuestionKey = "age" | "sat" | "time" | GroupKey;
type FilterKey = "gender" | "age" | "freq" | "channel" | "sat" | "repeat" | "city";
type Metric = "mean" | "median" | "mode" | "std" | "percent" | "count" | "distribution" | "conversion";

interface IGroup {
  name: string;
  members: string[]; // нормалізовані варіанти відповідей
}
interface IQuestion {
  label: string;
  numeric?: boolean;
}
interface IFilter {
  label: string;
  test: (r: Row, v: string) => boolean;
  text?: (v: string) => string;
}
interface CalcArgs {
  q: QuestionKey;
  metric: Metric;
  value: string;
}
interface CalcRow {
  label: string;
  count: number;
  pct: number;
}
interface CalcResult {
  text: string;
  label: string;
  rows?: CalcRow[]; // для відсоткового розподілу
}
interface State {
  sort: SortLevel[];
  search: string;
  page: number;
  selected: Set<number>;
  groups: Record<GroupKey, IGroup[]>;
  calc: CalcArgs | null;
  flashId: number | null;
  from: string; // діапазон дат (yyyy-mm-dd)
  to: string;
  filters: Record<FilterKey, string>;
}

// ---------- Константи ----------
const PAGE_SIZE = 8;
const DAY = 24 * 3600 * 1000;
const MONTHS = ["січ.", "лют.", "бер.", "квіт.", "трав.", "черв.", "лип.", "серп.", "вер.", "жовт.", "лист.", "груд."];
const FREQ: Frequency[] = ["Раз на тиждень", "Кілька разів на тиждень", "Кілька разів на місяць"];
const CHANNELS: Channel[] = ["Смартфон", "Комп’ютер", "Планшет"];
const CITIES = ["Київ", "Львів", "Одеса", "Харків", "Дніпро"];
const AGE_GROUPS: AgeGroup[] = ["18–24", "25–34", "35–44", "45+"];
const NUMERIC_ONLY: Metric[] = ["mean", "median", "std"];
const GROUPABLE: GroupKey[] = ["freq", "channel", "repeat", "city", "name"];
const FEMALE_NAMES = ["Олена", "Марія", "Ірина", "Наталія", "Софія", "Катерина", "Оксана", "Анна", "Юлія", "Вікторія"];
const MALE_NAMES = ["Андрій", "Олександр", "Дмитро", "Іван", "Максим", "Богдан", "Сергій", "Тарас", "Олег", "Микола"];

const QUESTIONS: Record<QuestionKey, IQuestion> = {
  age: { label: "Вік, роки", numeric: true },
  sat: { label: "Задоволеність (1–5)", numeric: true },
  time: { label: "Час проходження, с", numeric: true },
  freq: { label: "Частота покупок" },
  channel: { label: "Канал" },
  repeat: { label: "Повторна покупка (Так/Ні)" },
  city: { label: "Місто (відкрите запитання)" },
  name: { label: "Ім’я (відкрите запитання)" },
};

// ---------- Доступ до елементів ----------
function $<T extends HTMLElement = HTMLElement>(id: string): T {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Елемент #${id} не знайдено`);
  return el as T;
}

// ---------- Допоміжні функції ----------
const esc = (s: string | number): string =>
  String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c] as string);
const norm = (s: string | number): string => String(s).trim().replace(/\s+/g, " ").toLowerCase(); // ігноруємо регістр і зайві пробіли
const canon = (n: string): string => n.charAt(0).toUpperCase() + n.slice(1);
const fmtNum = (n: number): string => n.toLocaleString("uk-UA", { maximumFractionDigits: 2 });
const ageGroup = (age: number): AgeGroup => (age < 25 ? "18–24" : age < 35 ? "25–34" : age < 45 ? "35–44" : "45+");
const pad2 = (n: number): string => String(n).padStart(2, "0");
const fmtDate = (ts: number): string => {
  const d = new Date(ts);
  return `${d.getDate()} ${MONTHS[d.getMonth()]}, ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
};
const fmtDuration = (sec: number): string => `${Math.floor(sec / 60)} хв ${pad2(Math.round(sec % 60))} с`;
const toRow = (r: IResponse): Row => ({ ...r, ts: new Date(r.date).getTime() });
const toIso = (ts: number): string => {
  const d = new Date(ts);
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}T${pad2(d.getHours())}:${pad2(d.getMinutes())}:00`;
};

// Випадкові числа — лише для імітації нових відповідей
const rand = Math.random;
const randBetween = (a: number, b: number): number => a + Math.floor(rand() * (b - a + 1));
function pick<T>(arr: readonly T[], weights?: number[]): T {
  if (!weights) return arr[Math.floor(rand() * arr.length)];
  let r = rand() * weights.reduce((a, b) => a + b, 0);
  for (let i = 0; i < arr.length; i++) {
    r -= weights[i];
    if (r < 0) return arr[i];
  }
  return arr[arr.length - 1];
}
function cityVariant(c: string): string {
  const r = rand();
  return r < 0.6 ? c : r < 0.75 ? c.toUpperCase() : r < 0.9 ? c.toLowerCase() : `  ${c} `;
}

// ---------- Стан ----------
const DEFAULT_SORT: SortLevel[] = [{ key: "date", dir: "desc" }];
const state: State = {
  sort: [...DEFAULT_SORT],
  search: "",
  page: 1,
  selected: new Set<number>(),
  groups: { freq: [], channel: [], city: [], name: [], repeat: [] }, // ручні групи
  calc: null,
  flashId: null,
  from: "",
  to: "",
  filters: { gender: "", age: "", freq: "", channel: "", sat: "", repeat: "", city: "" },
};

let data: Row[] = [];
let nowTs = Date.now(); // «поточний момент» системи; після завантаження = дата найновішої відповіді
let nextId = 1;
let surveyStats: ISurvey | null = null; // загальна статистика опитування (для конверсії)

// Сире значення відповіді як текст (для логічного поля — «Так»/«Ні»)
function rawValue(row: Row, q: GroupKey): string {
  if (q === "repeat") return row.repeat ? "Так" : "Ні";
  if (q === "name") return row.name ?? "";
  return String(row[q]);
}

// Значення відповіді з урахуванням груп та автооб’єднання однакових; порожнє поле — ""
function show(row: Row, q: GroupKey): string {
  const n = norm(rawValue(row, q));
  if (!n) return "";
  const g = state.groups[q].find((x) => x.members.includes(n));
  return g ? g.name : canon(n);
}

// ---------- Сортування та фільтрація ----------
const SORT_VALUE: Record<SortKey, (r: Row) => string | number | null> = {
  id: (r) => r.id,
  name: (r) => show(r, "name") || null, // порожні імена — внизу
  age: (r) => r.age,
  freq: (r) => show(r, "freq"),
  channel: (r) => show(r, "channel"),
  sat: (r) => r.sat,
  repeat: (r) => (r.repeat ? 1 : 0), // логічне: «Ні» < «Так»
  date: (r) => r.ts,
};

function compare(a: Row, b: Row): number {
  for (const { key, dir } of state.sort) {
    const x = SORT_VALUE[key](a);
    const y = SORT_VALUE[key](b);
    const xEmpty = x == null || x === "";
    const yEmpty = y == null || y === "";
    if (xEmpty && yEmpty) continue;
    if (xEmpty) return 1; // порожні значення завжди внизу
    if (yEmpty) return -1;
    const c = typeof x === "string" ? x.localeCompare(String(y), "uk") : (x as number) - (y as number);
    if (c) return dir === "asc" ? c : -c;
  }
  return b.id - a.id;
}

// Фільтри за значенням: ключ = ключ у state.filters та id поля f-<ключ>
const FILTERS: Record<FilterKey, IFilter> = {
  gender: { label: "Стать", test: (r, v) => r.gender === v },
  age: { label: "Вік", test: (r, v) => ageGroup(r.age) === v },
  freq: { label: "Частота", test: (r, v) => norm(r.freq) === norm(v) },
  channel: { label: "Канал", test: (r, v) => norm(r.channel) === norm(v) },
  sat: { label: "Задоволеність", test: (r, v) => (v === "none" ? r.sat == null : r.sat === Number(v)), text: (v) => (v === "none" ? "без оцінки" : `${v} із 5`) },
  repeat: { label: "Повторна покупка", test: (r, v) => (r.repeat ? "Так" : "Ні") === v },
  city: { label: "Місто", test: (r, v) => norm(r.city) === norm(v) },
};
const FILTER_KEYS = Object.keys(FILTERS) as FilterKey[];

// Діапазон дат; якщо початок пізніше за кінець — діапазон не застосовується
const dateError = (): boolean => !!(state.from && state.to && state.from > state.to);
function dateRange(): [number, number] | null {
  if ((!state.from && !state.to) || dateError()) return null;
  const a = state.from ? new Date(`${state.from}T00:00:00`).getTime() : -Infinity;
  const b = state.to ? new Date(`${state.to}T23:59:59`).getTime() : Infinity;
  return [a, b];
}

function matches(r: Row): boolean {
  for (const key of FILTER_KEYS) {
    const v = state.filters[key];
    if (v && !FILTERS[key].test(r, v)) return false;
  }
  const range = dateRange();
  if (range && (r.ts < range[0] || r.ts > range[1])) return false;
  const q = norm(state.search);
  if (q) {
    const hay = norm(`${String(r.id).padStart(5, "0")} ${r.id} ${show(r, "freq")} ${show(r, "channel")} ${show(r, "city")} ${show(r, "name")}`);
    if (!hay.includes(q)) return false;
  }
  return true;
}

const getView = (): Row[] => data.filter(matches).sort(compare);

// ---------- Відображення ----------
function renderRows(view: Row[]): void {
  const start = (state.page - 1) * PAGE_SIZE;
  $("rows").innerHTML = view
    .slice(start, start + PAGE_SIZE)
    .map((r) => {
      const sel = state.selected.has(r.id);
      return `<tr class="${sel ? "selected" : ""} ${r.id === state.flashId ? "row-new" : ""}">
        <td><label class="row-id"><input type="checkbox" class="row-check" data-id="${r.id}" ${sel ? "checked" : ""}><span>№ ${String(r.id).padStart(5, "0")}</span></label></td>
        <td>${show(r, "name") ? esc(show(r, "name")) : "—"}</td>
        <td>${ageGroup(r.age)}</td>
        <td>${esc(show(r, "freq"))}</td>
        <td>${esc(show(r, "channel"))}</td>
        <td class="sat">${r.sat == null ? "—" : `${r.sat} із 5`}</td>
        <td>${esc(show(r, "repeat"))}</td>
        <td>${fmtDate(r.ts)}</td>
      </tr>`;
    })
    .join("");
  state.flashId = null;
}

function renderPagination(total: number): void {
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

function renderChips(total: number): void {
  const range = state.from || state.to;
  const filtered = state.search || range || FILTER_KEYS.some((k) => state.filters[k]);
  const clear = (key: string): string => `<button type="button" data-clear="${key}" aria-label="Прибрати фільтр">×</button>`;
  const chips = [`<span class="chip">${filtered ? "Знайдено" : "Усі відповіді"} · ${total}</span>`, `<span class="chip">Завершені</span>`];
  FILTER_KEYS.forEach((key) => {
    const v = state.filters[key];
    if (v) chips.push(`<span class="chip">${FILTERS[key].label}: ${esc(FILTERS[key].text ? FILTERS[key].text!(v) : v)}${clear(key)}</span>`);
  });
  if (range && !dateError()) chips.push(`<span class="chip">Дата: ${state.from || "…"} — ${state.to || "…"}${clear("range")}</span>`);
  $("chips").innerHTML = chips.join("");
}

function renderSortUI(): void {
  document.querySelectorAll<HTMLElement>(".results-table th[data-sort]").forEach((th) => {
    const i = state.sort.findIndex((s) => s.key === th.dataset.sort);
    th.setAttribute("aria-sort", i < 0 ? "none" : state.sort[i].dir === "asc" ? "ascending" : "descending");
    th.querySelector(".sort-level")!.textContent = i >= 0 && state.sort.length > 1 ? String(i + 1) : "";
  });
  const isDefault = state.sort.length === 1 && state.sort[0].key === "date" && state.sort[0].dir === "desc";
  $("sort-reset").hidden = isDefault;
  const select = $<HTMLSelectElement>("sort-preset");
  const preset = state.sort.length === 1 ? `${state.sort[0].key}-${state.sort[0].dir}` : "custom";
  select.value = [...select.options].some((o) => o.value === preset) ? preset : "custom";
}

function renderKpi(): void {
  if (!data.length) return;
  $("kpi-total").textContent = String(data.length);
  $("kpi-new").textContent = String(data.filter((r) => r.ts >= nowTs - 7 * DAY).length);
  $("kpi-time").textContent = fmtDuration(data.reduce((s, r) => s + r.time, 0) / data.length);
  $("meta-count").textContent = `${data.length} відповідей · 12 запитань`;
}

function refresh(): void {
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
  document.querySelector<HTMLElement>(".results-table")!.hidden = empty;
  $("pagination").hidden = empty;
  const from = empty ? 0 : (state.page - 1) * PAGE_SIZE + 1;
  const to = Math.min(state.page * PAGE_SIZE, view.length);
  const sel = state.selected.size ? ` · обрано ${state.selected.size}` : "";
  $("shown").textContent = `Показано ${from}–${to} із ${view.length} відповідей${sel}`;

  fillCalcValues(); // список відповідей для розрахунків залежить від фільтрів
  if (state.calc) runCalc(true); // динамічне перерахування
}

// ---------- Сортування ----------
function toggleSort(key: SortKey, add: boolean): void {
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

document.querySelector(".results-table thead")!.addEventListener("click", (e) => {
  const th = (e.target as Element).closest<HTMLElement>("th[data-sort]");
  if (th) toggleSort(th.dataset.sort as SortKey, (e as MouseEvent).shiftKey);
});
$("sort-reset").addEventListener("click", () => {
  state.sort = [...DEFAULT_SORT];
  state.page = 1;
  refresh();
});
$("sort-preset").addEventListener("change", (e) => {
  const [key, dir] = (e.target as HTMLSelectElement).value.split("-");
  if (key === "custom") return;
  state.sort = [{ key: key as SortKey, dir: dir as SortDir }];
  state.page = 1;
  refresh();
});

// ---------- Пошук, фільтри, пагінація ----------
$("search").addEventListener("input", (e) => {
  state.search = (e.target as HTMLInputElement).value;
  state.page = 1;
  refresh();
});
$("filters-toggle").addEventListener("click", () => {
  const open = $("filters-panel").hidden;
  $("filters-panel").hidden = !open;
  $("filters-toggle").setAttribute("aria-expanded", String(open));
});

function setFilter(key: FilterKey, val: string): void {
  state.filters[key] = val;
  state.page = 1;
  refresh();
}
FILTER_KEYS.forEach((key) => $(`f-${key}`).addEventListener("change", (e) => setFilter(key, (e.target as HTMLSelectElement).value)));

// Діапазон дат з перевіркою коректності
function onDates(): void {
  state.from = $<HTMLInputElement>("f-from").value;
  state.to = $<HTMLInputElement>("f-to").value;
  const bad = dateError();
  $("f-from").classList.toggle("invalid", bad);
  $("f-to").classList.toggle("invalid", bad);
  $("date-error").hidden = !bad;
  state.page = 1;
  refresh();
}
$("f-from").addEventListener("change", onDates);
$("f-to").addEventListener("change", onDates);

$("filters-reset").addEventListener("click", () => {
  FILTER_KEYS.forEach((key) => {
    $<HTMLSelectElement>(`f-${key}`).value = "";
    state.filters[key] = "";
  });
  $<HTMLInputElement>("f-from").value = "";
  $<HTMLInputElement>("f-to").value = "";
  onDates();
});

$("chips").addEventListener("click", (e) => {
  const key = (e.target as Element).closest<HTMLElement>("[data-clear]")?.dataset.clear;
  if (!key) return;
  if (key === "range") {
    $<HTMLInputElement>("f-from").value = "";
    $<HTMLInputElement>("f-to").value = "";
    return onDates();
  }
  $<HTMLSelectElement>(`f-${key}`).value = "";
  setFilter(key as FilterKey, "");
});
$("pagination").addEventListener("click", (e) => {
  const btn = (e.target as Element).closest<HTMLButtonElement>("[data-page]");
  if (!btn || btn.disabled) return;
  state.page = Number(btn.dataset.page);
  refresh();
});
$("rows").addEventListener("change", (e) => {
  const input = e.target as HTMLInputElement;
  if (!input.classList.contains("row-check")) return;
  const id = Number(input.dataset.id);
  if (input.checked) state.selected.add(id);
  else state.selected.delete(id);
  refresh();
});

// ---------- Нові відповіді в реальному часі ----------
function addResponse(): void {
  if (!data.length) return;
  nowTs += randBetween(4, 11) * 60000;
  const group = pick(AGE_GROUPS, [22, 38, 26, 14]);
  const [min, max] = { "18–24": [18, 24], "25–34": [25, 34], "35–44": [35, 44], "45+": [45, 68] }[group];
  const gender = pick(["Жіноча", "Чоловіча"] as const, [55, 45]);
  const row: Row = {
    id: nextId++,
    name: rand() < 0.07 ? null : cityVariant(pick(gender === "Жіноча" ? FEMALE_NAMES : MALE_NAMES)),
    age: randBetween(min, max),
    gender,
    freq: pick(FREQ, [55, 30, 15]),
    channel: pick(CHANNELS, [74, 21, 5]),
    sat: rand() < 0.04 ? null : pick([1, 2, 3, 4, 5], [3, 5, 10, 35, 47]),
    repeat: rand() < 0.64,
    city: cityVariant(pick(CITIES)),
    time: randBetween(120, 420),
    date: toIso(nowTs),
    ts: nowTs,
  };
  data.unshift(row);
  state.flashId = row.id;
  refresh(); // якщо відповідь не підпадає під активний фільтр — список не змінюється
}
$("simulate").addEventListener("click", addResponse);
setInterval(addResponse, 60000); // нова відповідь раз на хвилину (для демонстрації)

// ---------- Експорт (CSV зберігає порядок рядків з екрана) ----------
$("export-btn").addEventListener("click", () => {
  const head = ["№", "Ім’я", "Вік", "Вікова група", "Стать", "Частота покупок", "Канал", "Задоволеність", "Повторна покупка", "Місто", "Час, с", "Дата"];
  const lines = getView().map((r) =>
    [r.id, show(r, "name"), r.age, ageGroup(r.age), r.gender, show(r, "freq"), show(r, "channel"), r.sat ?? "", show(r, "repeat"), show(r, "city"), r.time, fmtDate(r.ts)]
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
const dialog = $<HTMLDialogElement>("group-dialog");

interface IGroupItem {
  label: string;
  count: number;
  group?: IGroup;
}

// Варіанти відповідей запитання (з підрахунком); порожні відповіді не групуються
function groupItems(q: GroupKey): IGroupItem[] {
  const map = new Map<string, number>();
  data.forEach((r) => {
    const label = show(r, q);
    if (label) map.set(label, (map.get(label) ?? 0) + 1);
  });
  return [...map]
    .map(([label, count]) => ({ label, count, group: state.groups[q].find((g) => g.name === label) }))
    .sort((a, b) => b.count - a.count);
}

// Усі запитання показані одним списком, щоб можна було спробувати вибрати відповіді з різних запитань (це заблоковано)
function renderGroupList(): void {
  $("group-list").innerHTML = GROUPABLE.map((q) => {
    const answered = data.filter((r) => show(r, q)).length;
    const items = groupItems(q)
      .map((it, i) => {
        const pct = (it.count / answered) * 100;
        return `<div class="group-item">
        <input type="checkbox" class="row-check" data-q="${q}" data-label="${esc(it.label)}" id="gi-${q}-${i}">
        <label for="gi-${q}-${i}" class="group-label">
          <span>${esc(it.label)}${it.group ? ' <em class="tag-mini">група</em>' : ""}</span>
          <span class="group-bar"><i style="width:${pct.toFixed(1)}%"></i></span>
        </label>
        <span class="group-count">${it.count}</span>
        <span class="group-pct">${fmtNum(pct)}%</span>
        ${it.group ? `<button type="button" class="link-btn" data-q="${q}" data-ungroup="${esc(it.label)}">Розгрупувати</button>` : "<span></span>"}
      </div>`;
      })
      .join("");
    return `<div class="group-section">${QUESTIONS[q].label}</div>${items}`;
  }).join("");
}

function groupError(msg: string, highlightName = false): void {
  $("group-error").hidden = !msg;
  $("group-error").textContent = msg;
  $("group-name").classList.toggle("invalid", highlightName);
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

$("group-create").addEventListener("click", () => {
  const name = $<HTMLInputElement>("group-name").value.trim();
  const checked = [...$("group-list").querySelectorAll<HTMLInputElement>(".row-check:checked")].map((c) => ({ q: c.dataset.q as GroupKey, label: c.dataset.label ?? "" }));
  if (!name) return groupError("Вкажіть назву групи", true);
  if (checked.length < 2) return groupError("Оберіть щонайменше два варіанти відповіді");
  // Групувати можна лише відповіді на одне й те саме запитання
  if (new Set(checked.map((c) => c.q)).size > 1) return groupError("Групувати можна лише відповіді на одне й те саме запитання. Зніміть вибір з інших запитань.");

  const q = checked[0].q;
  // Якщо серед вибраних уже є група — розгортаємо її учасників
  const members = new Set<string>();
  checked.forEach(({ label }) => {
    const g = state.groups[q].find((x) => x.name === label);
    if (g) {
      g.members.forEach((m) => members.add(m));
      state.groups[q] = state.groups[q].filter((x) => x !== g);
    } else members.add(norm(label));
  });
  state.groups[q].push({ name, members: [...members] });
  $<HTMLInputElement>("group-name").value = "";
  groupError("");
  renderGroupList();
  refresh();
});

$("group-list").addEventListener("click", (e) => {
  const btn = (e.target as Element).closest<HTMLElement>("[data-ungroup]");
  if (!btn) return;
  const q = btn.dataset.q as GroupKey;
  state.groups[q] = state.groups[q].filter((g) => g.name !== btn.dataset.ungroup);
  renderGroupList();
  refresh();
});

// ---------- Розрахунковий скрипт ----------
const calcQ = $<HTMLSelectElement>("calc-question");
const calcMetric = $<HTMLSelectElement>("calc-metric");
(Object.keys(QUESTIONS) as QuestionKey[]).forEach((k) => calcQ.insertAdjacentHTML("beforeend", `<option value="${k}">${QUESTIONS[k].label}</option>`));

const isNumeric = (q: QuestionKey): boolean => !!QUESTIONS[q].numeric;
const needsValue = (m: string): boolean => m === "percent" || m === "count";
const cellValue = (r: Row, q: QuestionKey): string | number | null => {
  if (isNumeric(q)) return r[q as "age" | "sat" | "time"];
  return show(r, q as GroupKey) || null; // порожня відповідь не враховується
};

// Ключ для відсоткового розподілу (вік і час групуються в інтервали)
function distKey(r: Row, q: QuestionKey): string | null {
  if (q === "age") return ageGroup(r.age);
  if (q === "time") return `${Math.floor(r.time / 60)}–${Math.floor(r.time / 60) + 1} хв`;
  if (q === "sat") return r.sat == null ? null : `${r.sat} із 5`;
  const v = cellValue(r, q);
  return v == null ? null : String(v);
}

function fillCalcValues(): void {
  const q = calcQ.value as QuestionKey;
  const vals = [...new Set(data.filter(matches).map((r) => cellValue(r, q)).filter((v): v is string | number => v != null))];
  vals.sort((a, b) => (typeof a === "number" && typeof b === "number" ? a - b : String(a).localeCompare(String(b), "uk")));
  const select = $<HTMLSelectElement>("calc-value");
  const prev = select.value;
  select.innerHTML = vals.map((v) => `<option value="${esc(v)}">${esc(v)}</option>`).join("");
  if (vals.map(String).includes(prev)) select.value = prev;
}

function syncMetricUI(): void {
  $("calc-value-wrap").hidden = !needsValue(calcMetric.value);
  $("calc-q-wrap").hidden = calcMetric.value === "conversion"; // конверсія стосується всього опитування
}

function syncCalcControls(): void {
  const numeric = isNumeric(calcQ.value as QuestionKey);
  // Для нечислових типів середнє, медіана й відхилення недоступні
  [...calcMetric.options].forEach((o) => (o.disabled = !numeric && NUMERIC_ONLY.includes(o.value as Metric)));
  if (calcMetric.selectedOptions[0]?.disabled) calcMetric.value = "mode";
  $("calc-note").textContent = numeric ? "" : "Середнє значення, медіана та стандартне відхилення доступні лише для числових запитань.";
  syncMetricUI();
  fillCalcValues();
}

function calculate({ q, metric, value }: CalcArgs): CalcResult {
  // Конверсія: частка респондентів, що завершили опитування, серед тих, хто його відкрив
  if (metric === "conversion") {
    if (!surveyStats) throw new Error("no-stats");
    const completed = data.length;
    const opened = surveyStats.opened + Math.round(Math.max(0, completed - surveyStats.completed) * 1.25); // нові відповіді теж були відкриттями
    if (!opened) throw new Error("zero-division");
    return { text: `${fmtNum((completed / opened) * 100)}%`, label: `Конверсія проходження: ${completed} із ${opened} респондентів завершили опитування` };
  }

  const rows = data.filter(matches);
  if (metric === "distribution") {
    const counts = new Map<string, number>();
    rows.forEach((r) => {
      const k = distKey(r, q);
      if (k != null) counts.set(k, (counts.get(k) ?? 0) + 1);
    });
    const total = [...counts.values()].reduce((a, b) => a + b, 0);
    if (!total) throw new Error("empty");
    const list = [...counts].map(([label, count]) => ({ label, count, pct: (count / total) * 100 })).sort((x, y) => y.count - x.count);
    return { text: "", label: `Відсотковий розподіл відповідей · ${QUESTIONS[q].label} · разом ${total}`, rows: list };
  }

  const vals = rows.map((r) => cellValue(r, q)).filter((v): v is string | number => v != null && v !== "");
  const n = vals.length;
  if (!n) throw new Error("empty");
  const nums = vals as number[];
  const mean = (): number => nums.reduce((a, b) => a + b, 0) / n;
  switch (metric) {
    case "mean":
      return { text: fmtNum(mean()), label: "Середнє значення" };
    case "median": {
      const sorted = [...nums].sort((a, b) => a - b);
      const m = n % 2 ? sorted[(n - 1) / 2] : (sorted[n / 2 - 1] + sorted[n / 2]) / 2;
      return { text: fmtNum(m), label: "Медіана" };
    }
    case "mode": {
      const c = new Map<string | number, number>();
      vals.forEach((v) => c.set(v, (c.get(v) ?? 0) + 1));
      const top = Math.max(...c.values());
      const modes = [...c].filter(([, k]) => k === top).map(([v]) => (typeof v === "number" ? fmtNum(v) : v));
      return { text: modes.join(", "), label: `Мода (зустрічається ${top} р.)` };
    }
    case "std": {
      if (n < 2) throw new Error("few");
      const m = mean();
      const sd = Math.sqrt(nums.reduce((sum, v) => sum + (v - m) ** 2, 0) / (n - 1));
      return { text: fmtNum(sd), label: "Стандартне відхилення" };
    }
    default: {
      // count / percent
      const total = rows.length;
      if (!total) throw new Error("empty");
      const cnt = vals.filter((v) => String(v) === value).length;
      const pct = (cnt / total) * 100;
      return metric === "count"
        ? { text: `${cnt}`, label: `Відповідей «${value}» · ${fmtNum(pct)}% від ${total}` }
        : { text: `${fmtNum(pct)}%`, label: `Відповіді «${value}» · ${cnt} із ${total}` };
    }
  }
}

function runCalc(silent = false): void {
  const args: CalcArgs = { q: calcQ.value as QuestionKey, metric: calcMetric.value as Metric, value: $<HTMLSelectElement>("calc-value").value };
  state.calc = args;
  const box = $("calc-result");
  try {
    const res = calculate(args);
    box.className = "calc-result";
    if (res.rows) {
      box.innerHTML =
        `<span class="dist-title">${esc(res.label)}</span>` +
        res.rows
          .map((r) => `<div class="dist-row"><span class="dist-label">${esc(r.label)}</span><span class="dist-bar"><i style="width:${r.pct.toFixed(1)}%"></i></span><span class="dist-val">${r.count} · ${fmtNum(r.pct)}%</span></div>`)
          .join("");
    } else {
      const subject = args.metric === "conversion" ? "" : ` · ${QUESTIONS[args.q].label}`;
      box.innerHTML = `<strong>${esc(res.text)}</strong><span>${esc(res.label)}${esc(subject)}</span>`;
    }
    if (silent) {
      box.classList.add("updated");
      setTimeout(() => box.classList.remove("updated"), 800);
    }
  } catch {
    // Немає даних або обчислення неможливе (наприклад, ділення на нуль) — система не падає
    box.className = "calc-result error";
    box.textContent = "Недостатньо даних або неможливо виконати обчислення";
  }
}

calcQ.addEventListener("change", () => {
  state.calc = null;
  $("calc-result").textContent = "";
  syncCalcControls();
});
calcMetric.addEventListener("change", syncMetricUI);
$("calc-run").addEventListener("click", () => runCalc());

// ---------- Нові відповіді з JSON (оновлення в реальному часі) ----------
// Сторінка періодично перечитує JSON; відповіді з новими id з’являються без перезавантаження.
async function pollNew(): Promise<void> {
  try {
    const list = await loadJson<IResponse[]>(RESPONSES_URL, true);
    const known = new Set(data.map((r) => r.id));
    const fresh = list.filter((r) => !known.has(r.id)).map(toRow);
    if (!fresh.length) return;
    data.unshift(...fresh);
    nowTs = Math.max(nowTs, ...fresh.map((r) => r.ts));
    nextId = Math.max(nextId, ...fresh.map((r) => r.id + 1));
    state.flashId = Math.max(...fresh.map((r) => r.id));
    refresh(); // якщо нова відповідь не підпадає під активний фільтр — список не змінюється
  } catch {
    // тимчасова помилка мережі — спробуємо наступного разу
  }
}

// ---------- Старт: завантаження JSON ----------
async function start(): Promise<void> {
  $("shown").textContent = "Завантаження даних…";
  try {
    const list = await loadJson<IResponse[]>(RESPONSES_URL);
    data = list.map(toRow);
    nowTs = Math.max(...data.map((r) => r.ts)); // «зараз» = дата найновішої відповіді
    nextId = Math.max(...data.map((r) => r.id)) + 1;
  } catch (err) {
    console.error(err);
    $("shown").textContent = "";
    showLoadError(document.querySelector<HTMLElement>(".results-card"), "Не вдалося завантажити відповіді. Перевірте адресу JSON-файлу в .env та підключення до мережі.");
    return;
  }
  try {
    const surveys = await loadJson<ISurvey[]>(SURVEYS_URL);
    surveyStats = surveys.find((x) => x.name === "Звички онлайн-покупок 2026") ?? null;
  } catch {
    surveyStats = null; // без статистики недоступна лише конверсія
  }
  syncCalcControls();
  refresh();
  setInterval(pollNew, POLL_MS);
}

void start();
