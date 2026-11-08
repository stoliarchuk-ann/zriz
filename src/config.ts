// Адреси JSON-файлів. За замовчуванням — локальні файли з public/data.
// Щоб брати дані з хмарного сховища, вкажіть посилання у файлі .env (див. .env.example).
const env = import.meta.env as Record<string, string | undefined>;

export const RESPONSES_URL: string = env.VITE_RESPONSES_URL || "/data/responses.json";
export const TRENDS_URL: string = env.VITE_TRENDS_URL || "/data/trends.json";
export const SURVEYS_URL: string = env.VITE_SURVEYS_URL || "/data/surveys.json";
export const POLL_MS = 15000; // як часто перевіряти нові відповіді в JSON
