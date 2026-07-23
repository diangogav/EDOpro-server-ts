/**
 * Verifies that when a roster pair is passed to RequestWindBotJoin.execute()
 * with deckOverride set to pair.deck:
 *   - the resulting WindbotData uses pair.deck
 *   - deckcode is absent/cleared (windbot honors deckcode over deck; clearing it
 *     forces windbot to use the deck field and the correct format banlist deck)
 *
 * Spec scenario: deckOverride clears deckcode.
 */

import { RequestWindBotJoin } from "@ygopro/windbot/application/RequestWindBotJoin";
import { WindbotBotlistRepository } from "@ygopro/windbot/domain/WindbotBotlistRepository";
import { WindbotData } from "@ygopro/windbot/domain/WindbotData";
import { WindbotTokenStore } from "@ygopro/windbot/domain/WindbotTokenStore";

import { pickBotFromRoster } from "./MatchmakingBotRoster";

function makeRepo(bot: WindbotData): WindbotBotlistRepository {
	return {
		findAll: jest.fn().mockReturnValue([bot]),
		findByName: jest.fn().mockReturnValue(bot),
		pickRandom: jest.fn().mockReturnValue(bot),
	};
}

function makeTokenStore(): WindbotTokenStore {
	return WindbotTokenStore.createForTests();
}

describe("deckOverride boundary — roster pair clears deckcode in RequestWindBotJoin", () => {
	it("deckOverride set to pair.deck clears deckcode (TCG pair)", () => {
		const pair = pickBotFromRoster("tcg", () => 0); // Salamangreat Bot
		// Simulate a source bot that has a deckcode field (e.g. from botlist.json)
		const sourceBot: WindbotData = { name: pair.name, deck: pair.deck, deckcode: "some-code-123" };

		const repo = makeRepo(sourceBot);
		const tokenStore = makeTokenStore();
		const useCase = new RequestWindBotJoin(repo, tokenStore);

		const { bot } = useCase.execute(1, pair.name, pair.deck);

		// deckOverride wins: bot.deck must equal pair.deck
		expect(bot.deck).toBe(pair.deck);
		// deckcode MUST be cleared so windbot uses the deck field, not deckcode
		expect(bot.deckcode).toBeUndefined();
	});

	it("deckOverride set to pair.deck clears deckcode (JTP pair — Joey)", () => {
		const pair = pickBotFromRoster("jtp", () => 0); // Joey
		const sourceBot: WindbotData = { name: pair.name, deck: pair.deck, deckcode: "jtp-code" };

		const repo = makeRepo(sourceBot);
		const tokenStore = makeTokenStore();
		const useCase = new RequestWindBotJoin(repo, tokenStore);

		const { bot } = useCase.execute(2, pair.name, pair.deck);

		expect(bot.deck).toBe("JTP");
		expect(bot.name).toBe("Joey");
		expect(bot.deckcode).toBeUndefined();
	});

	it("without deckOverride, deckcode is preserved (control case)", () => {
		const sourceBot: WindbotData = { name: "Joey", deck: "JTP", deckcode: "original-code" };

		const repo = makeRepo(sourceBot);
		const tokenStore = makeTokenStore();
		const useCase = new RequestWindBotJoin(repo, tokenStore);

		// No deckOverride
		const { bot } = useCase.execute(3, "Joey");

		expect(bot.deckcode).toBe("original-code");
	});
});
