// Загальна статистика опитування (surveys.json) — для розрахунку конверсії
export interface ISurvey {
  name: string;
  type: "quantitative" | "qualitative"; // кількісне або якісне опитування
  opened: number; // скільки респондентів відкрило опитування
  completed: number; // скільки завершили
  questions: number;
}
