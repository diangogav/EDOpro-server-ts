import { Service } from "diod";

import { Logger } from "@shared/logger/domain/Logger";
import {
	MatchContext,
	MatchLifecycleHook,
	RoomClosedContext,
} from "@shared/room/domain/lifecycle/MatchLifecycleHook";

type LifecyclePhase = "onMatchStarted" | "onMatchEnding";

export const MATCH_ENDING_HOOK_BUDGET_MS = 1500;

/**
 * Runs every registered MatchLifecycleHook. One failing hook never affects
 * another hook or the match itself (per-hook try/catch, logged as a
 * warning). `runStarted` never blocks its synchronous caller. `runEnding`
 * is awaited by the caller but never blocks match teardown past
 * MATCH_ENDING_HOOK_BUDGET_MS, regardless of how long a hook takes.
 */
@Service()
export class MatchLifecycleHooks {
	private readonly hooks: MatchLifecycleHook[] = [];

	constructor(private readonly logger: Logger) {}

	register(hook: MatchLifecycleHook): void {
		this.hooks.push(hook);
	}

	runStarted(ctx: MatchContext): void {
		const starting = this.hooks.filter((hook) => hook.onMatchStarted !== undefined);
		void Promise.allSettled(starting.map((hook) => this.invoke(hook, "onMatchStarted", ctx)));
	}

	async runEnding(ctx: MatchContext): Promise<void> {
		const ending = this.hooks.filter((hook) => hook.onMatchEnding !== undefined);
		if (ending.length === 0) {
			return;
		}

		const work = Promise.allSettled(ending.map((hook) => this.invoke(hook, "onMatchEnding", ctx)));
		const { promise: budget, clear: clearBudget } = this.budget(ctx);
		await Promise.race([work.then(clearBudget), budget]);
	}

	/**
	 * Fires when a room is torn down, whether the match reached a clean end or
	 * not (abandoned, disconnected mid-duel, error fallback). Hooks that keep
	 * per-match state must release it here — `onMatchEnding` alone is not a
	 * complete release point, since teardown does not require a prior clean
	 * finish.
	 */
	runClosed(ctx: RoomClosedContext): void {
		const closing = this.hooks.filter((hook) => hook.onRoomClosed !== undefined);
		void Promise.allSettled(closing.map((hook) => this.invokeClosed(hook, ctx)));
	}

	private async invokeClosed(hook: MatchLifecycleHook, ctx: RoomClosedContext): Promise<void> {
		try {
			await hook.onRoomClosed?.(ctx);
		} catch (error) {
			this.logger.warn(
				`Match lifecycle hook "${hook.name}" failed in onRoomClosed: ${String(error)}`,
				{
					hook: hook.name,
					phase: "onRoomClosed",
					roomId: ctx.roomId,
				},
			);
		}
	}

	private budget(ctx: MatchContext): { promise: Promise<void>; clear: () => void } {
		let timer: NodeJS.Timeout;
		const promise = new Promise<void>((resolve) => {
			timer = setTimeout(() => {
				this.logger.warn(
					`MatchLifecycleHooks.runEnding exceeded its ${MATCH_ENDING_HOOK_BUDGET_MS}ms budget — proceeding with teardown`,
					{ roomId: ctx.roomId },
				);
				resolve();
			}, MATCH_ENDING_HOOK_BUDGET_MS);
			timer.unref?.();
		});
		return { promise, clear: () => clearTimeout(timer) };
	}

	private async invoke(
		hook: MatchLifecycleHook,
		phase: LifecyclePhase,
		ctx: MatchContext,
	): Promise<void> {
		try {
			await hook[phase]?.(ctx);
		} catch (error) {
			this.logger.warn(`Match lifecycle hook "${hook.name}" failed in ${phase}: ${String(error)}`, {
				hook: hook.name,
				phase,
				roomId: ctx.roomId,
			});
		}
	}
}
