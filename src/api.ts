// Завантаження JSON (локального або з хмарного сховища)
export async function loadJson<T>(url: string, fresh = false): Promise<T> {
  const res = await fetch(url, { cache: fresh ? "no-store" : "default" }); // fresh — не брати з кешу (для оновлення в реальному часі)
  if (!res.ok) throw new Error(`Не вдалося завантажити ${url}: HTTP ${res.status}`);
  const json: unknown = await res.json();
  // Деякі сервіси (наприклад jsonbin) повертають дані в полі "record"
  if (json && typeof json === "object" && !Array.isArray(json) && "record" in json) {
    return (json as { record: T }).record;
  }
  return json as T;
}

// Показує повідомлення про помилку завантаження замість порожньої сторінки
export function showLoadError(target: HTMLElement | null, message: string): void {
  if (!target) return;
  target.insertAdjacentHTML("afterbegin", `<div class="load-error" role="alert">${message}</div>`);
}
