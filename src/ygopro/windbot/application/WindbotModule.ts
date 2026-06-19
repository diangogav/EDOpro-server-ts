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
 * Callers use this module via the singleton accessor.
 * Tests use WindbotModule.createForTests(deps) to inject all dependencies.
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
	 * Called once at boot from src/index.ts when ENABLE_WINDBOT=true.
	 */
	static init(deps: WindbotModuleDeps): void {
		WindbotModule._instance = new WindbotModule(deps);
	}

	/**
	 * Returns the singleton instance.
	 * Throws if init() was never called — callers that guard on isInitialized() avoid this.
	 */
	static getInstance(): WindbotModule {
		if (!WindbotModule._instance) {
			throw new Error("WindbotModule not initialized — call WindbotModule.init() first");
		}
		return WindbotModule._instance;
	}

	/**
	 * Guard for call sites that run for EVERY room (windbot or not), such as
	 * YGOProDuelingState.removeRoom(). Returns false before init() is called
	 * so the cleanup hook is a no-op for non-windbot rooms.
	 *
	 * Usage pattern:
	 *   if (WindbotModule.isInitialized() && WindbotModule.getInstance().isEnabled()) {
	 *     WindbotModule.getInstance().cleanupRoom(roomId);
	 *   }
	 */
	static isInitialized(): boolean {
		return WindbotModule._instance !== null;
	}

	/**
	 * Convenience guard: run cleanupRoom only when initialized AND enabled.
	 * Returns 0 (no-op) when windbot is not initialized or disabled.
	 *
	 * Use this at ALL windbot token cleanup call sites (removeRoom, handleYGOPro, etc.)
	 * to avoid duplicating the two-line guard everywhere.
	 */
	static cleanupRoomIfEnabled(roomId: number): number {
		if (!WindbotModule.isInitialized()) {
			return 0;
		}
		const instance = WindbotModule.getInstance();
		if (!instance.isEnabled()) {
			return 0;
		}
		return instance.cleanupRoom(roomId);
	}

	/**
	 * Test seam: construct a module with injected deps without touching the singleton.
	 */
	static createForTests(deps: WindbotModuleDeps): WindbotModule {
		return new WindbotModule(deps);
	}

	/**
	 * Test seam: reset the singleton so test suites can call init() cleanly.
	 * MUST NOT be called in production code.
	 */
	static resetForTests(): void {
		WindbotModule._instance = null;
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
		isFinalizing: () => boolean,
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
