import { randomInt } from "crypto";

export function generateUniqueId(): number {
  const min = 1000;
  const max = 9999;

  return randomInt(min, max + 1);
}
