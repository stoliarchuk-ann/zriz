export interface ITrendPoint {
  date: string;
  online: number;
  offline: number;
  mobile: number;
  satisfied: number;
  responses: number;
}

export interface ITrendData {
  segments: Record<string, ITrendPoint[]>;
}