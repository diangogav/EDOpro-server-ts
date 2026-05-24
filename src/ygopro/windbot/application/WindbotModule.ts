import { WindbotBotlistRepository } from "../domain/WindbotBotlistRepository";
import { WindbotTokenPayload, WindbotTokenStore } from "../domain/WindbotTokenStore";
import { WindbotData } from "../domain/WindbotData";
import { RequestWindBotJoin } from "./RequestWindBotJoin";
import { ConsumeWindBotToken } from "./ConsumeWindBotToken";
import { CleanupWindBotTokens } from "./CleanupWindBotTokens";

export interface WindbotProviderPort {
	requestJoin(params: {
		token: string;
		bot: WindbotData;
		isFinalizing: () => boolean;
	}): Promise<void>;
}

export interface WindbotModuleDeps {
	enabled: boolean;
	repo: WindbotBotlistRepository;
	tokenStore: WindbotTokenStore;
	provider: WindbotProviderPort;
}

/**
 * WindbotModule — singleton facade that wires together all windbot use cases.
 *
 * Callers (PR-4 strategies) use this module via the singleton accessor.
 * Tests use WindbotModule.createForTests(deps) to inject all dependencies.
 *
 * Not wired into src/index.ts yet — that is PR-7 scope.
 */
export class WindbotModule {
	private readonly requestJoinUseCase: RequestWindBotJoin;
	private readonly consumeTokenUseCase: ConsumeWindBotToken;
	private readonly cleanupRoomUseCase: CleanupWindBotTokens;

	private constructor(private readonly deps: WindbotModuleDeps) {
		this.requestJoinUseCase = new RequestWindBotJoin(deps.repo, deps.tokenStore);
		this.consumeTokenUseCase = new ConsumeWindBotToken(deps.tokenStore);
		this.cleanupRoomUseCase = new CleanupWindBotTokens(deps.tokenStore);
	}

	// ---- singleton accessor (mirrors YGOProRoomList pattern) ----

	private static _instance: WindbotModule | null = null;

	/**
	 * Init the module singleton from parsed config and infrastructure deps.
	 * Called once at boot from src/index.ts (PR-7) when ENABLE_WINDBOT=true.
	 */
	static init(deps: WindbotModuleDeps): void {
		WindbotModule._instance = new WindbotModule(deps);
	}

	/**
	 * Returns the singleton instance.
	 * Throws if init() was never called — callers that guard on isEnabled() avoid this.
	 */
	static getInstance(): WindbotModule {
		if (!WindbotModule._instance) {
			throw new Error("WindbotModule not initialized — call WindbotModule.init() first");
		}
		return WindbotModule._instance;
	}

	/**
	 * Test seam: construct a module with injected deps without touching the singleton.
	 */
	static createForTests(deps: WindbotModuleDeps): WindbotModule {
		return new WindbotModule(deps);
	}

	// ---- facade methods ----

	isEnabled(): boolean {
		return this.deps.enabled;
	}

	/**
	 * Composes RequestWindBotJoin (register token) THEN provider.requestJoin (fire HTTP).
	 *
	 * On HTTP failure, cleans up the just-registered token before rethrowing so
	 * no zombie token remains.
	 */
	async requestBot(
		roomId: number,
		botNameOrNull: string | null,
		isFinalizing: () => boolean
	): Promise<{ token: string; bot: WindbotData }> {
		const { token, bot } = this.requestJoinUseCase.execute(roomId, botNameOrNull);

		try {
			await this.deps.provider.requestJoin({ token, bot, isFinalizing });
		} catch (err) {
			// Clean up the registered token so no zombie entry remains
			this.deps.tokenStore.clearByRoom(roomId);
			throw err;
		}

		return { token, bot };
	}

	consumeToken(token: string): WindbotTokenPayload {
		return this.consumeTokenUseCase.execute(token);
	}

	cleanupRoom(roomId: number): number {
		return this.cleanupRoomUseCase.execute(roomId);
	}
}
