// ===== Сторінка «Аналіз трендів» =====
// Дані (добові показники) завантажуються з JSON. Період обирається полями дат + кнопка «Застосувати».

import { TRENDS_URL } from "./config";
import { loadJson, showLoadError } from "./api";
import type { ITrendData, ITrendPoint } from "./model/itrend";

// ---------- Типи ----------
type Granularity = "days" | "weeks" | "months";
type PeriodClass = string; // 'day' | 'week' | 'month' | 'year' | 'custom-N'

interface Range {
  from: Date;
  to: Date;
}
interface Bucket {
  label: string;
  online: number;
  offline: number;
  mobile: number;
  satisfied: number;
  n: number;
}
type Metric = "online" | "offline" | "mobile" | "satisfied";
type ViewMode = "line" | "bar" | "table"; // графік, стовпчаста діаграма або таблиця

// ---------- Константи ----------
const DAY = 24 * 3600 * 1000;
const MAIN_SURVEY = "Звички онлайн-покупок 2026"; // дані є лише для цього опитування
const MONTH_NAMES = ["Січень", "Лютий", "Березень", "Квітень", "Травень", "Червень", "Липень", "Серпень", "Вересень", "Жовтень", "Листопад", "Грудень"];
const GRAN_BY_LABEL: Record<string, Granularity> = { "За днями": "days", "За тижнями": "weeks", "За місяцями": "months" };
const AGE_SEGMENTS = ["18–24", "25–34", "35–44", "45+"];

function $<T extends HTMLElement = HTMLElement>(id: string): T {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Елемент #${id} не знайдено`);
  return el as T;
}

// ---------- Дати ----------
const pad2 = (n: number): string => String(n).padStart(2, "0");
const toStr = (d: Date): string => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
const fromStr = (s: string): Date => new Date(`${s}T00:00:00`);
const fmt = (d: Date): string => `${pad2(d.getDate())}.${pad2(d.getMonth() + 1)}.${d.getFullYear()}`;
const rangeLabel = (r: Range): string => `${fmt(r.from)}–${fmt(r.to)}`;
const dayCount = (r: Range): number => Math.round((r.to.getTime() - r.from.getTime()) / DAY) + 1;
const addDays = (d: Date, n: number): Date => new Date(d.getTime() + n * DAY);

// Тип проміжку: порівнювати можна лише проміжки одного типу (день з днем, тиждень з тижнем, місяць з місяцем)
function classify(days: number): PeriodClass {
  if (days === 1) return "day";
  if (days === 7) return "week";
  if (days >= 28 && days <= 31) return "month";
  if (days >= 365 && days <= 366) return "year";
  return `custom-${days}`;
}
const classTitle = (c: PeriodClass): string => ({ day: "1 день", week: "тиждень", month: "місяць", year: "рік" } as Record<string, string>)[c] ?? `${c.replace("custom-", "")} дн.`;

// ---------- Стан ----------
let trends: ITrendData;
let firstDate: Date;
let lastDate: Date;

const view = {
  survey: MAIN_SURVEY,
  segment: "Усі респонденти",
  gran: "months" as Granularity,
  mode: "line" as ViewMode,
  a: null as Range | null,
  b: null as Range | null,
};

const points = (seg: string, r: Range): ITrendPoint[] =>
  (trends.segments[seg] ?? []).filter((p) => p.date >= toStr(r.from) && p.date <= toStr(r.to));

// ---------- Групування точок у «кошики» ----------
const avg = (arr: ITrendPoint[], k: Metric): number => arr.reduce((s, p) => s + p[k], 0) / arr.length;

function makeBucket(label: string, pts: ITrendPoint[]): Bucket {
  return {
    label,
    online: avg(pts, "online"),
    offline: avg(pts, "offline"),
    mobile: avg(pts, "mobile"),
    satisfied: avg(pts, "satisfied"),
    n: pts.reduce((s, p) => s + p.responses, 0),
  };
}

function bucketize(pts: ITrendPoint[], gran: Granularity): Bucket[] {
  if (!pts.length) return [];
  const short = (p: ITrendPoint): string => `${p.date.slice(8, 10)}.${p.date.slice(5, 7)}`;
  if (gran === "days") return pts.map((p) => makeBucket(short(p), [p]));
  if (gran === "weeks") {
    const out: Bucket[] = [];
    for (let i = 0; i < pts.length; i += 7) out.push(makeBucket(short(pts[i]), pts.slice(i, i + 7)));
    return out;
  }
  const groups = new Map<string, ITrendPoint[]>();
  pts.forEach((p) => groups.set(p.date.slice(0, 7), [...(groups.get(p.date.slice(0, 7)) ?? []), p]));
  const manyYears = new Set(pts.map((p) => p.date.slice(0, 4))).size > 1;
  return [...groups].map(([key, g]) => {
    const name = MONTH_NAMES[Number(key.slice(5, 7)) - 1];
    return makeBucket(manyYears ? `${name} ’${key.slice(2, 4)}` : name, g);
  });
}

// Якщо кошиків менше двох, переходимо до дрібнішого кроку (місяці → тижні → дні)
function bucketsFor(pts: ITrendPoint[], gran: Granularity): Bucket[] {
  const order: Granularity[] = ["months", "weeks", "days"];
  for (let i = order.indexOf(gran); i < order.length; i++) {
    const b = bucketize(pts, order[i]);
    if (b.length >= 2 || i === order.length - 1) return b;
  }
  return [];
}

function resample(values: number[], n: number): number[] {
  if (values.length === n) return values;
  return Array.from({ length: n }, (_, i) => {
    const s = Math.floor((i * values.length) / n);
    const e = Math.max(s + 1, Math.floor(((i + 1) * values.length) / n));
    const part = values.slice(s, e);
    return part.reduce((a, b) => a + b, 0) / part.length;
  });
}

// ---------- Малювання ----------
const ICON_ATTR = 'viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"';
const ICONS = {
  arrowUpRight: `<svg class="icon arrow" width="20" height="20" ${ICON_ATTR}><path d="M7 7h10v10"/><path d="M7 17 17 7"/></svg>`,
  arrowUp: `<svg class="icon" width="14" height="14" ${ICON_ATTR}><path d="M12 19V5"/><path d="m5 12 7-7 7 7"/></svg>`,
  arrowDown: `<svg class="icon" width="14" height="14" ${ICON_ATTR}><path d="M12 5v14"/><path d="m19 12-7 7-7-7"/></svg>`,
};

function chartSvg(curr: number[], prev: number[]): string {
  const W = 1000;
  const H = 200;
  const pts = (arr: number[]): string => {
    const a = arr.length === 1 ? [arr[0], arr[0]] : arr; // одна точка — рівна лінія
    return a.map((v, i) => `${((i * W) / (a.length - 1)).toFixed(1)},${(H - (Math.min(100, Math.max(0, v)) / 100) * H).toFixed(1)}`).join(" ");
  };
  const grid = [0, 1, 2, 3, 4].map((i) => `<line class="grid-line" x1="0" x2="${W}" y1="${(i * H) / 4}" y2="${(i * H) / 4}"/>`).join("");
  return `<div class="chart-body">
    <div class="y-axis">${["100%", "75%", "50%", "25%", "0%"].map((l) => `<span>${l}</span>`).join("")}</div>
    <div class="plot"><svg class="chart-svg" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" aria-hidden="true">
      <defs><linearGradient id="area-grad" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="0" y2="${H}">
        <stop offset="0" stop-color="#E55B7B" stop-opacity="0.19"/><stop offset="1" stop-color="#E55B7B" stop-opacity="0"/></linearGradient></defs>
      ${grid}
      <polygon class="area" points="${pts(curr)} ${W},${H} 0,${H}" fill="url(#area-grad)"/>
      <polyline class="line line-prev" points="${pts(prev)}"/>
      <polyline class="line line-curr" points="${pts(curr)}"/>
    </svg></div></div>`;
}

function xAxis(labels: string[]): string {
  const k = Math.min(6, labels.length);
  const idx = k === 1 ? [0] : Array.from({ length: k }, (_, i) => Math.round((i * (labels.length - 1)) / (k - 1)));
  return `<div class="x-axis">${[...new Set(idx)].map((i) => `<span>${labels[i]}</span>`).join("")}</div>`;
}

// Стовпчаста діаграма: на кожен період — два стовпчики (онлайн/магазини або період А/Б)
function barsHtml(curr: number[], prev: number[], labels: string[]): string {
  const dense = curr.length > 16; // багато стовпчиків — без підписів значень
  const groups = curr
    .map((v, i) => {
      const a = Math.min(100, Math.max(0, v));
      const b = Math.min(100, Math.max(0, prev[i]));
      return `<div class="bar-group"><div class="bar bar-curr" style="height:${a}%" title="${labels[i] ?? ""}: ${Math.round(a)}%">${dense ? "" : `<span class="bar-val">${Math.round(a)}%</span>`}</div>
        <div class="bar bar-prev" style="height:${b}%" title="${labels[i] ?? ""}: ${Math.round(b)}%">${dense ? "" : `<span class="bar-val">${Math.round(b)}%</span>`}</div></div>`;
    })
    .join("");
  return `<div class="chart-body"><div class="y-axis">${["100%", "75%", "50%", "25%", "0%"].map((l) => `<span>${l}</span>`).join("")}</div>
    <div class="plot bars-plot${dense ? " bars-dense" : ""}">${groups}</div></div>`;
}

// Таблиця значень (з підсумковим рядком — середнє за період)
function tableHtml(bucketsA: Bucket[], bucketsB: Bucket[] | null): string {
  const pct = (v: number): string => `${v.toFixed(1).replace(".", ",")}%`;
  if (bucketsB) {
    const n = Math.min(bucketsA.length, bucketsB.length);
    const rows = Array.from({ length: n }, (_, i) => {
      const d = bucketsA[i].online - bucketsB[i].online;
      return `<tr><td>${bucketsA[i].label}</td><td>${pct(bucketsA[i].online)}</td><td>${pct(bucketsB[i].online)}</td><td class="${d >= 0 ? "pos" : "neg"}">${d >= 0 ? "+" : ""}${d.toFixed(1).replace(".", ",")} в. п.</td></tr>`;
    }).join("");
    return `<div class="table-wrap"><table class="trend-table"><thead><tr><th>Проміжок</th><th>Період А, онлайн</th><th>Період Б, онлайн</th><th>Різниця</th></tr></thead><tbody>${rows}</tbody></table></div>`;
  }
  const rows = bucketsA.map((b) => `<tr><td>${b.label}</td><td>${pct(b.online)}</td><td>${pct(b.offline)}</td><td>${pct(b.mobile)}</td><td>${pct(b.satisfied)}</td><td>${b.n}</td></tr>`).join("");
  const mean = (k: Metric): number => bucketsA.reduce((s, b) => s + b[k], 0) / bucketsA.length;
  const total = bucketsA.reduce((s, b) => s + b.n, 0);
  const foot = `<tr class="total"><td>Середнє / разом</td><td>${pct(mean("online"))}</td><td>${pct(mean("offline"))}</td><td>${pct(mean("mobile"))}</td><td>${pct(mean("satisfied"))}</td><td>${total}</td></tr>`;
  return `<div class="table-wrap"><table class="trend-table"><thead><tr><th>Проміжок</th><th>Онлайн</th><th>В магазинах</th><th>Мобільні покупки</th><th>Задоволені</th><th>Відповідей</th></tr></thead><tbody>${rows}</tbody><tfoot>${foot}</tfoot></table></div>`;
}

function chartMessage(text: string): void {
  $("chart-mount").innerHTML = `<div class="chart-message">${text}</div>`;
}

function badge(delta: number | null): string {
  if (delta === null) return "";
  const r = Math.round(delta);
  const icon = r > 0 ? ICONS.arrowUp : r < 0 ? ICONS.arrowDown : "";
  return `<div class="badge">${icon}<span>${Math.abs(r)} в. п.</span></div>`;
}

function statCard(title: string, value: string, delta: number | null, desc: string): string {
  return `<div class="stat-card"><div class="card-header"><h3>${title}</h3>${ICONS.arrowUpRight}</div>
    <div class="value-row"><div class="value">${value}</div>${badge(delta)}</div><p class="desc">${desc}</p></div>`;
}

function renderStats(cards: [string, string, number | null, string][]): void {
  $("stats-grid").innerHTML = cards.map((c) => statCard(...c)).join("");
}

// ---------- Побудова всього екрана за поточним станом ----------
function render(): void {
  const { a, b } = view;
  if (!a) return;

  if (view.survey !== MAIN_SURVEY) {
    renderStats([
      ["Купують щотижня", "—", null, "Немає даних"],
      ["Частка мобільних покупок", "—", null, "Немає даних"],
      ["Задоволені досвідом", "—", null, "Немає даних"],
    ]);
    chartMessage("Для цього опитування ще недостатньо даних для аналізу трендів.");
    $("sample-info").textContent = "Вибірка: 0 відповідей";
    $("ins-title").textContent = "Недостатньо даних";
    $("ins-text").textContent = "Зберіть більше відповідей, щоб побачити тренди.";
    $("ins-note").textContent = "Висновок на основі 0 відповідей";
    return;
  }

  const ptsA = points(view.segment, a);
  if (!ptsA.length) {
    chartMessage(`Немає даних за обраний період. Доступні дані: ${fmt(firstDate)}–${fmt(lastDate)}.`);
    return;
  }
  const ptsB = b ? points(view.segment, b) : [];
  if (b && !ptsB.length) {
    chartMessage(`Немає даних за період порівняння. Доступні дані: ${fmt(firstDate)}–${fmt(lastDate)}.`);
    return;
  }

  // Крок групування: однаковий для обох періодів
  const gran = view.gran;
  const bucketsA = bucketsFor(ptsA, gran);
  const bucketsB = b ? bucketsFor(ptsB, gran) : [];
  const n = b ? Math.min(bucketsA.length, bucketsB.length) : bucketsA.length;

  // Графік / діаграма / таблиця та легенда
  const labels = bucketsA.map((x) => x.label);
  const currSeries = b ? resample(bucketsA.map((x) => x.online), n) : bucketsA.map((x) => x.online);
  const prevSeries = b ? resample(bucketsB.map((x) => x.online), n) : bucketsA.map((x) => x.offline);
  $("legend").hidden = view.mode === "table";
  $("legend").innerHTML = b
    ? `<span class="legend-item current">Період А: ${rangeLabel(a)}</span><span class="legend-item prev">Період Б: ${rangeLabel(b)}</span>`
    : `<span class="legend-item current">Покупки онлайн</span><span class="legend-item prev">Покупки в магазинах</span>`;
  if (view.mode === "table") $("chart-mount").innerHTML = tableHtml(bucketsA, b ? bucketsB : null);
  else if (view.mode === "bar") $("chart-mount").innerHTML = barsHtml(currSeries, prevSeries, labels) + xAxis(labels);
  else $("chart-mount").innerHTML = chartSvg(currSeries, prevSeries) + xAxis(labels);

  // Картки показників
  const first = bucketsA[0];
  const last = bucketsA[bucketsA.length - 1];
  const single = bucketsA.length < 2;
  const meanA = (k: Metric): number => avg(ptsA, k);
  const meanB = (k: Metric): number => avg(ptsB, k);
  const cardFor = (title: string, k: Metric, desc: string): [string, string, number | null, string] => {
    if (b) return [title, `${Math.round(meanA(k))}%`, meanA(k) - meanB(k), `Порівняно з періодом Б`];
    if (single) return [title, `${Math.round(last[k])}%`, null, desc];
    return [title, `${Math.round(last[k])}%`, last[k] - first[k], desc];
  };
  const mobileBest = !b && !single && bucketsA.every((x) => last.mobile >= x.mobile);
  renderStats([
    cardFor("Купують щотижня", "online", `Порівняно з періодом «${first.label}»`),
    cardFor("Частка мобільних покупок", "mobile", mobileBest ? "Найвищий показник за період" : `Середнє за період: ${Math.round(meanA("mobile"))}%`),
    cardFor("Задоволені досвідом", "satisfied", "Оцінки 4–5 за п’ятибальною шкалою"),
  ]);

  // Вибірка та висновки
  const sample = ptsA.reduce((s, p) => s + p.responses, 0);
  $("sample-info").textContent = `Вибірка: ${sample} відповідей`;
  $("ins-note").textContent = `Висновок на основі ${sample} відповідей`;

  const delta = b ? meanA("online") - meanB("online") : single ? 0 : last.online - first.online;
  const from = b ? Math.round(meanB("online")) : Math.round(first.online);
  const to = b ? Math.round(meanA("online")) : Math.round(last.online);
  $("ins-title").textContent = delta > 2 ? "Звичка стає регулярною" : delta < -2 ? "Інтерес знижується" : "Показник стабільний";
  const verb = delta > 2 ? "зросла" : delta < -2 ? "знизилась" : "майже не змінилась";
  let text = `${b ? "У періоді А" : "За обраний період"} частка щотижневих покупців ${verb} з ${from}% до ${to}%.`;

  // Сегмент, що зростає найшвидше
  if (!b && !single) {
    let best = "";
    let bestDelta = 0;
    AGE_SEGMENTS.forEach((seg) => {
      const bk = bucketsFor(points(seg, a), gran);
      if (bk.length < 2) return;
      const d = bk[bk.length - 1].online - bk[0].online;
      if (d > bestDelta) {
        bestDelta = d;
        best = seg;
      }
    });
    if (best) text += ` Найшвидше зростає сегмент ${best === "45+" ? "45+ років" : `${best} роки`}.`;
  }
  $("ins-text").textContent = text;
}

// ---------- Перевірка періодів та кнопка «Застосувати» ----------
function setInvalid(ids: string[], on: boolean): void {
  ids.forEach((id) => $(id).classList.toggle("invalid", on));
}

function showError(msg: string): void {
  $("period-error").hidden = !msg;
  $("period-error").textContent = msg;
}
function showWarning(msg: string): void {
  $("period-warning").hidden = !msg;
  $("period-warning").textContent = msg;
}

// Повертає діапазон або текст помилки
function readRange(fromId: string, toId: string): Range | string {
  const f = $<HTMLInputElement>(fromId).value;
  const t = $<HTMLInputElement>(toId).value;
  if (!f || !t) {
    setInvalid([fromId], !f);
    setInvalid([toId], !t);
    return "Вкажіть початок і кінець періоду";
  }
  if (f > t) {
    setInvalid([fromId, toId], true);
    return "Дата початку пізніша за дату завершення";
  }
  const r = { from: fromStr(f), to: fromStr(t) };
  if (dayCount(r) > 366) {
    setInvalid([fromId, toId], true);
    return "Максимальний період для аналізу — 1 рік";
  }
  return r;
}

function apply(): void {
  setInvalid(["a-from", "a-to", "b-from", "b-to"], false);
  showError("");
  showWarning("");

  const a = readRange("a-from", "a-to");
  const compare = $<HTMLInputElement>("cmp-toggle").checked;
  const b = compare ? readRange("b-from", "b-to") : null;

  const error = typeof a === "string" ? a : typeof b === "string" ? b : "";
  if (error) {
    // Некоректний період: поле підсвічено, графік не будується
    showError(error);
    chartMessage("Графік не побудовано: виправте обраний період.");
    return;
  }
  const ra = a as Range;
  const rb = b as Range | null;

  if (rb) {
    const ca = classify(dayCount(ra));
    const cb = classify(dayCount(rb));
    if (ca !== cb) {
      // Порівнювати можна лише однакові за тривалістю проміжки — дію блокуємо
      showWarning(`Неможливо порівняти різні часові проміжки: ${classTitle(ca)} та ${classTitle(cb)}. Оберіть проміжки однакового типу.`);
      setInvalid(["b-from", "b-to"], true);
      return;
    }
  }
  view.a = ra;
  view.b = rb;
  render();
}

// Період порівняння за замовчуванням: такий самий за довжиною, одразу перед основним
function suggestCompare(): void {
  const r = readRange("a-from", "a-to");
  if (typeof r === "string") return;
  const len = dayCount(r);
  const to = addDays(r.from, -1);
  const from = addDays(to, -(len - 1));
  $<HTMLInputElement>("b-from").value = toStr(from < firstDate ? firstDate : from);
  $<HTMLInputElement>("b-to").value = toStr(to < firstDate ? firstDate : to);
}

function presetRange(name: string): Range | null {
  switch (name) {
    case "Травень — жовтень 2026":
      return { from: new Date(2026, 4, 1), to: lastDate };
    case "Останній рік":
      return { from: addDays(lastDate, -364), to: lastDate };
    case "Останні 30 днів":
      return { from: addDays(lastDate, -29), to: lastDate };
    case "Останні 7 днів":
      return { from: addDays(lastDate, -6), to: lastDate };
    case "1 день":
      return { from: lastDate, to: lastDate };
    default:
      return null; // «Власний період» — дати вводить користувач
  }
}

function setInputs(r: Range): void {
  $<HTMLInputElement>("a-from").value = toStr(r.from);
  $<HTMLInputElement>("a-to").value = toStr(r.to);
}

// ---------- Події ----------
function bind(): void {
  $("apply").addEventListener("click", apply);
  $("cmp-toggle").addEventListener("change", (e) => {
    const on = (e.target as HTMLInputElement).checked;
    $("cmp-row").hidden = !on;
    if (on && !$<HTMLInputElement>("b-from").value) suggestCompare();
    if (!on) {
      showWarning("");
      setInvalid(["b-from", "b-to"], false);
    }
  });

  // Вибір готового періоду лише підставляє дати — застосовується кнопкою «Застосувати»
  $("dd-period").addEventListener("dropdown-change", (e) => {
    const r = presetRange((e as CustomEvent<{ value: string }>).detail.value);
    if (r) setInputs(r);
  });
  $("dd-segment").addEventListener("dropdown-change", (e) => {
    view.segment = (e as CustomEvent<{ value: string }>).detail.value;
    render();
  });
  $("dd-survey").addEventListener("dropdown-change", (e) => {
    view.survey = (e as CustomEvent<{ value: string }>).detail.value;
    render();
  });
  $("dd-gran").addEventListener("dropdown-change", (e) => {
    view.gran = GRAN_BY_LABEL[(e as CustomEvent<{ value: string }>).detail.value] ?? "months";
    render();
  });
  $("view-tabs").addEventListener("click", (e) => {
    const btn = (e.target as Element).closest<HTMLButtonElement>("[data-mode]");
    if (!btn) return;
    view.mode = btn.dataset.mode as ViewMode;
    document.querySelectorAll<HTMLElement>("#view-tabs .view-tab").forEach((t) => {
      t.classList.toggle("active", t === btn);
      t.setAttribute("aria-selected", String(t === btn));
    });
    render();
  });
  $("export-pdf").addEventListener("click", () => window.print());
}

// ---------- Старт ----------
async function start(): Promise<void> {
  chartMessage("Завантаження даних…");
  try {
    trends = await loadJson<ITrendData>(TRENDS_URL);
    const all = trends.segments["Усі респонденти"];
    firstDate = fromStr(all[0].date);
    lastDate = fromStr(all[all.length - 1].date);

    // Межі вибору дат у календарі
    ["a-from", "a-to", "b-from", "b-to"].forEach((id) => {
      $<HTMLInputElement>(id).min = toStr(firstDate);
      $<HTMLInputElement>(id).max = toStr(lastDate);
    });
    bind();
    setInputs(presetRange("Травень — жовтень 2026")!);
    apply();
  } catch (err) {
    console.error(err);
    chartMessage("");
    showLoadError(document.querySelector<HTMLElement>(".chart-section"), "Не вдалося завантажити дані трендів. Перевірте адресу JSON-файлу в .env та підключення до мережі.");
  }
}

void start();
