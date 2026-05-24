import { WindbotTokenPayload, WindbotTokenStore } from "../domain/WindbotTokenStore";

export class ConsumeWindBotToken {
	constructor(private readonly tokenStore: WindbotTokenStore) {}

	execute(token: string): WindbotTokenPayload {
		return this.tokenStore.consume(token);
	}
}
