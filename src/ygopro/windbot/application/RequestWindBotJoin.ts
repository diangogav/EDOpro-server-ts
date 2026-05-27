import { WindbotBotlistRepository } from "../domain/WindbotBotlistRepository";
import { WindbotData } from "../domain/WindbotData";
import { WindbotNotFoundError, WindbotsExhaustedError } from "../domain/WindbotErrors";
import { WindbotTokenStore } from "../domain/WindbotTokenStore";

export type RequestWindBotJoinResult = {
	token: string;
	bot: WindbotData;
};

export class RequestWindBotJoin {
	constructor(
		private readonly repo: WindbotBotlistRepository,
		private readonly tokenStore: WindbotTokenStore
	) {}

	execute(
		roomId: number,
		botNameOrNull: string | null,
		deckOverride?: string
	): RequestWindBotJoinResult {
		const bot = this._resolveBot(botNameOrNull);
		const deck = deckOverride ?? bot.deck;
		const token = this.tokenStore.register(roomId, bot.name, deck);
		return { token, bot };
	}

	private _resolveBot(botNameOrNull: string | null): WindbotData {
		if (botNameOrNull !== null) {
			const bot = this.repo.findByName(botNameOrNull);
			if (bot === null) {
				throw new WindbotNotFoundError(botNameOrNull);
			}
			return bot;
		}

		const bot = this.repo.pickRandom();
		if (bot === null) {
			throw new WindbotsExhaustedError();
		}
		return bot;
	}
}
