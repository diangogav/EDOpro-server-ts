import { WindbotData } from "../domain/WindbotData";
import { WindbotUnreachableError } from "../domain/WindbotErrors";

export interface HttpWindBotProviderConfig {
	/** Base URL of the WindBot Docker HTTP service, e.g. "http://windbot:7790" */
	endpoint: string;
	/** IP or hostname the WindBot binary should connect back to */
	myIp: string;
	/** TCP port of the YGOPro game server */
	serverPort: number;
	/** YGOPro protocol version the bot must use (e.g. 0x1362) */
	version: number;
}

export interface RequestJoinParams {
	token: string;
	bot: WindbotData;
	/**
	 * Injected callback — checked before every attempt.
	 * If it returns true the retry loop aborts immediately.
	 * This keeps HttpWindBotProvider decoupled from YGOProRoom.
	 */
	isFinalizing: () => boolean;
}

const MAX_ATTEMPTS = 10;
const REQUEST_TIMEOUT_MS = 500;

/**
 * HttpWindBotProvider
 *
 * Fires a GET request to the WindBot Docker service so it reverse-connects
 * to the YGOPro game server with the given token. The request shape matches
 * the WindBot binary contract (srvpro2): a GET with query-string params and a
 * `password` field carrying `AIJOIN#{token}`.
 *
 * Retry policy:
 *   - Up to 10 attempts, no backoff sleep (matches srvpro2 tuning).
 *   - Per-attempt timeout: 500 ms via AbortSignal.timeout().
 *   - Between attempts: checks isFinalizing(); aborts immediately if true.
 *   - After all attempts exhausted or isFinalizing() true: throws WindbotUnreachableError.
 */
export class HttpWindBotProvider {
	constructor(private readonly config: HttpWindBotProviderConfig) {}

	async requestJoin(params: RequestJoinParams): Promise<void> {
		const { token, bot, isFinalizing } = params;
		const url = this.buildUrl(token, bot);

		for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
			if (isFinalizing()) {
				throw new WindbotUnreachableError(bot.name, attempt - 1);
			}

			try {
				const response = await fetch(url, {
					method: "GET",
					signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
				});

				if (response.ok) {
					return;
				}
				// non-2xx — fall through to retry
			} catch {
				// network error or timeout — fall through to retry
			}
		}

		throw new WindbotUnreachableError(bot.name, MAX_ATTEMPTS);
	}

	private buildUrl(token: string, bot: WindbotData): string {
		const url = new URL(this.config.endpoint);
		url.searchParams.set("name", bot.name);
		url.searchParams.set("deck", bot.deck);
		url.searchParams.set("host", this.config.myIp);
		url.searchParams.set("port", this.config.serverPort.toString());
		url.searchParams.set("version", this.config.version.toString());
		url.searchParams.set("password", `AIJOIN#${token}`);
		if (bot.dialog !== undefined) {
			url.searchParams.set("dialog", bot.dialog);
		}
		if (bot.deckcode !== undefined) {
			url.searchParams.set("deckcode", bot.deckcode);
		}

		return url.toString();
	}
}
