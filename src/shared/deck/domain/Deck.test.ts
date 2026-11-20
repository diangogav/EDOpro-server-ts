import { BanList } from "@shared/ban-list/BanList";
import { Card } from "@shared/card/domain/Card";
import { CardTypes } from "@shared/card/domain/CardTypes";
import { DeckRules } from "@shared/room/domain/YgoRoom";

import { Deck } from "./Deck";
import { DeckErrorType } from "./errors/DeckErrorType";
import { TooManySkillsError } from "./errors/TooManySkillsError";
import { Rule } from "./Rule";

class OpenBanList extends BanList {
	public add(): void {
		// Lists nothing: every card is allowed.
	}
}

const SKILL_A = 900;
const SKILL_B = 901;
const FUSION = 800;

function card(code: number): Card {
	let type: number = CardTypes.TYPE_MONSTER;
	if (code >= SKILL_A) {
		type = CardTypes.TYPE_SKILL;
	} else if (code === FUSION) {
		type = CardTypes.TYPE_MONSTER | CardTypes.TYPE_FUSION;
	}

	return new Card({ alias: "0", code: code.toString(), type, category: 0, variant: 0 });
}

function monsters(amount: number): number[] {
	return Array.from({ length: amount }, (_, index) => index + 1);
}

function deckOf({
	main,
	extra = [],
	side = [],
}: {
	main: number[];
	extra?: number[];
	side?: number[];
}): Deck {
	return new Deck({
		main: main.map(card),
		extra: extra.map(card),
		side: side.map(card),
		banList: new OpenBanList(),
		deckRules: new DeckRules({
			mainMin: 20,
			mainMax: 30,
			extraMin: 0,
			extraMax: 6,
			sideMin: 0,
			sideMax: 6,
			rule: Rule.ALL,
		}),
	});
}

describe("Deck", () => {
	describe("validate()", () => {
		it("accepts a deck with one Skill in the Main Deck", () => {
			expect(deckOf({ main: [...monsters(30), SKILL_A] }).validate()).toBeNull();
		});

		it("refuses more than one Skill in the Main Deck", () => {
			const error = deckOf({ main: [...monsters(20), SKILL_A, SKILL_B] }).validate();

			expect(error).toBeInstanceOf(TooManySkillsError);
			expect(error).toMatchObject({ type: DeckErrorType.DECK_TOO_MANY_SKILLS, code: 0, got: 0 });
		});

		it("accepts several Skills in the Main Deck when the deck content is not checked", () => {
			const deck = deckOf({ main: [...monsters(20), SKILL_A, SKILL_B] });

			expect(deck.validate({ contentChecked: false })).toBeNull();
		});

		it("accepts several Skills in the Side Deck", () => {
			const deck = deckOf({ main: [...monsters(20), SKILL_A], side: [SKILL_A, SKILL_B] });

			expect(deck.validate()).toBeNull();
		});

		it("accepts a deck without Skills", () => {
			expect(deckOf({ main: monsters(20), extra: [FUSION], side: [50] }).validate()).toBeNull();
		});
	});

	describe("keepsSideDeckingShape()", () => {
		const original = deckOf({
			main: [...monsters(20), SKILL_A],
			extra: [FUSION],
			side: [50, SKILL_B],
		});

		it("accepts a Skill swapped for the one in the Side Deck", () => {
			const sideDecked = deckOf({
				main: [...monsters(20), SKILL_B],
				extra: [FUSION],
				side: [50, SKILL_A],
			});

			expect(original.keepsSideDeckingShape(sideDecked)).toBe(true);
		});

		it("accepts a Skill added from the Side Deck to a deck that had none", () => {
			const withoutSkill = deckOf({ main: monsters(20), side: [SKILL_A] });
			const sideDecked = deckOf({ main: [...monsters(20), SKILL_A] });

			expect(withoutSkill.keepsSideDeckingShape(sideDecked)).toBe(true);
		});

		it("accepts the Skill moved to the Side Deck", () => {
			const sideDecked = deckOf({
				main: monsters(20),
				extra: [FUSION],
				side: [50, SKILL_A, SKILL_B],
			});

			expect(original.keepsSideDeckingShape(sideDecked)).toBe(true);
		});

		it("refuses a second Skill in the Main Deck", () => {
			const sideDecked = deckOf({
				main: [...monsters(20), SKILL_A, SKILL_B],
				extra: [FUSION],
				side: [50],
			});

			expect(original.keepsSideDeckingShape(sideDecked)).toBe(false);
		});

		it("accepts as many Skills in the Main Deck as the deck already had", () => {
			const twoSkills = deckOf({ main: [...monsters(20), SKILL_A, SKILL_B], side: [50] });
			const sideDecked = deckOf({ main: [...monsters(19), 50, SKILL_A, SKILL_B], side: [20] });

			expect(twoSkills.keepsSideDeckingShape(sideDecked)).toBe(true);
		});

		it("refuses a Main Deck whose size without Skills changes", () => {
			const sideDecked = deckOf({
				main: [...monsters(20), 50, SKILL_A],
				extra: [FUSION],
				side: [SKILL_B],
			});

			expect(original.keepsSideDeckingShape(sideDecked)).toBe(false);
		});

		it("refuses an Extra Deck whose size changes", () => {
			const sideDecked = deckOf({ main: [...monsters(20), SKILL_A], side: [50, SKILL_B, FUSION] });

			expect(original.keepsSideDeckingShape(sideDecked)).toBe(false);
		});

		it("accepts a card swapped with the Side Deck in a deck without Skills", () => {
			const withoutSkills = deckOf({ main: monsters(20), extra: [FUSION], side: [50] });
			const sideDecked = deckOf({ main: [...monsters(19), 50], extra: [FUSION], side: [20] });

			expect(withoutSkills.keepsSideDeckingShape(sideDecked)).toBe(true);
		});
	});

	describe("isSideDeckValid()", () => {
		const original = deckOf({ main: [...monsters(20), SKILL_A], extra: [FUSION], side: [50] });

		it("accepts the same cards arranged differently", () => {
			expect(original.isSideDeckValid([...monsters(19), 50, SKILL_A, FUSION], [20])).toBe(true);
		});

		it("refuses a deck with a different set of cards", () => {
			expect(original.isSideDeckValid([...monsters(19), 51, SKILL_A, FUSION], [20])).toBe(false);
			expect(original.isSideDeckValid([...monsters(20), SKILL_A, SKILL_A, FUSION], [50])).toBe(
				false,
			);
		});
	});
});
