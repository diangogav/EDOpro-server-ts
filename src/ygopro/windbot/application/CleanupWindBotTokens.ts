import { WindbotTokenStore } from "../domain/WindbotTokenStore";

export class CleanupWindBotTokens {
	constructor(private readonly tokenStore: WindbotTokenStore) {}

	execute(roomId: number): number {
		return this.tokenStore.clearByRoom(roomId);
	}
}
