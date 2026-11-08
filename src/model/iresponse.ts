import type { Channel, Frequency, Gender } from "./type";

// Одна відповідь респондента (запис у responses.json)
export interface IResponse {
  id: number;
  name: string | null; // ім'я — необов'язкове відкрите поле, регістр і пробіли довільні
  age: number;
  gender: Gender;
  freq: Frequency;
  channel: Channel;
  sat: number | null; // оцінка задоволеності 1–5, null — не заповнено
  repeat: boolean; // чи робив(ла) повторну покупку (Так/Ні)
  city: string; // відкрите запитання
  time: number; // час проходження, секунд
  date: string; // ISO-дата без часового поясу, напр. 2026-10-23T10:42:00
}
