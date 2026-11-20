import { Card } from "@shared/card/domain/Card";

/** A deck plays with at most this many Skills. */
export const MAX_SKILLS = 1;

export function skillCount(cards: readonly Card[]): number {
	return cards.filter((card) => card.isSkill()).length;
}
