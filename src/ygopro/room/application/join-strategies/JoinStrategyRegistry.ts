import { JoinContext, JoinStrategy } from "./JoinStrategy";
import { DefaultJoinStrategy } from "./DefaultJoinStrategy";

/**
 * JoinStrategyRegistry — ordered resolver for join strategies.
 *
 * Priority order (highest to lowest, per spec REQ-JOIN-101):
 *   1. AIJoinTokenStrategy  — catches reverse-connecting bot first (AIJOIN# prefix)
 *   2. WindBotJoinStrategy  — matches blank / AI / AI#name when windbot enabled
 *   3. DefaultJoinStrategy  — terminal fallback, always matches
 *
 * Mirrors the YGOProRoomList module-level singleton pattern.
 *
 * Test seam: JoinStrategyRegistry.createForTests(strategies) returns an isolated
 * instance that does NOT affect the module singleton.
 */
export class JoinStrategyRegistry {
	private constructor(private strategies: JoinStrategy[]) {}

	/**
	 * Returns the first strategy whose matches() returns true for the given context.
	 * Throws if no strategy matches (should never happen when DefaultJoinStrategy is last).
	 */
	resolve(ctx: JoinContext): JoinStrategy {
		const found = this.strategies.find((s) => s.matches(ctx));
		if (!found) {
			throw new Error("JoinStrategyRegistry: no strategy matched the join context");
		}
		return found;
	}

	// ---- module-level singleton ----

	private static _instance: JoinStrategyRegistry | null = null;

	/**
	 * Returns the module-level singleton.
	 * Lazily constructed with a DefaultJoinStrategy-only chain on first call
	 * (windbot strategies are added when WindbotModule is initialized, PR-7).
	 */
	static getInstance(): JoinStrategyRegistry {
		if (!JoinStrategyRegistry._instance) {
			JoinStrategyRegistry._instance = new JoinStrategyRegistry([new DefaultJoinStrategy()]);
		}
		return JoinStrategyRegistry._instance;
	}

	/**
	 * Replace the singleton with a custom strategy list.
	 * Called by PR-7 bootstrap when WindbotModule is ready.
	 */
	static setStrategies(strategies: JoinStrategy[]): void {
		JoinStrategyRegistry._instance = new JoinStrategyRegistry(strategies);
	}

	/**
	 * Reset the singleton (used in tests to avoid state leakage between suites).
	 */
	static reset(): void {
		JoinStrategyRegistry._instance = null;
	}

	/**
	 * Test seam — returns an isolated registry instance that does NOT affect the singleton.
	 */
	static createForTests(strategies: JoinStrategy[]): JoinStrategyRegistry {
		return new JoinStrategyRegistry(strategies);
	}
}
