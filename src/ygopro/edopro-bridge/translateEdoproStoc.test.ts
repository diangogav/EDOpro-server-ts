import { MainDeckLimitError } from "@shared/deck/domain/errors/MainDeckLimitError";
import { TooManySkillsError } from "@shared/deck/domain/errors/TooManySkillsError";
import { YGOProStocErrorMsg } from "ygopro-msg-encode";

import { translateEdoproStoc } from "./translateEdoproStoc";
import type { IgnisTranslationContext } from "./translateIgnisGameMsg";

const DECK_ERROR = 2;

function translate(frame: Buffer): YGOProStocErrorMsg {
	const translation = translateEdoproStoc(frame, {} as IgnisTranslationContext);
	if (translation.kind !== "stoc") {
		throw new Error(`unexpected translation: ${translation.kind}`);
	}

	return translation.message as YGOProStocErrorMsg;
}

describe("translateEdoproStoc", () => {
	describe("a deck error", () => {
		it("packs a Main Deck size error as its kind and the size the room counted", () => {
			const message = translate(new MainDeckLimitError(31, 20, 30).buffer());

			expect(message.msg).toBe(DECK_ERROR);
			expect(message.code).toBe(0x6000001f);
		});

		it("packs too many Skills as its kind with no card", () => {
			const message = translate(new TooManySkillsError().buffer());

			expect(message.msg).toBe(DECK_ERROR);
			expect(message.code).toBe(0xd0000000);
		});
	});
});
