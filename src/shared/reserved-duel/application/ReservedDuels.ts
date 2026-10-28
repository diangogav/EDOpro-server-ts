import { Logger } from "@shared/logger/domain/Logger";

import { ReservationStore } from "../domain/ReservationStore";
import { ReservedDuelAbandon, ReservedDuelRepository } from "../domain/ReservedDuelRepository";
import { ReservedDuelRecorder } from "../domain/ReservedDuelSession";
import { DEFAULT_RETRY_POLICY, RetryPolicy, retryWithBackoff } from "./retryWithBackoff";

export type ReservedDuelServicesDeps = {
	readonly store: ReservationStore;
	readonly repository: ReservedDuelRepository;
	readonly instanceId: string;
	readonly logger: Logger;
	readonly retryPolicy?: RetryPolicy;
};

/**
 * What the reserved-duel join path and the room lifecycle need at runtime.
 * Persistence writes run off the duel's path, retried with backoff; a write
 * that still fails is logged and left to the reader's stale-row handling.
 */
export class ReservedDuelServices implements ReservedDuelRecorder {
	public readonly store: ReservationStore;
	public readonly repository: ReservedDuelRepository;
	public readonly instanceId: string;
	private readonly logger: Logger;
	private readonly retryPolicy: RetryPolicy;

	constructor(deps: ReservedDuelServicesDeps) {
		this.store = deps.store;
		this.repository = deps.repository;
		this.instanceId = deps.instanceId;
		this.logger = deps.logger.child({ file: "ReservedDuelServices" });
		this.retryPolicy = deps.retryPolicy ?? DEFAULT_RETRY_POLICY;
	}

	public started(reservationId: string, matchId: string): void {
		this.inBackground("mark started", reservationId, () =>
			this.repository.markStarted(reservationId, matchId),
		);
	}

	public abandoned(reservationId: string, abandon: ReservedDuelAbandon): void {
		this.inBackground("record abandon", reservationId, () =>
			this.repository.recordAbandon(reservationId, abandon),
		);
	}

	public release(reservationId: string): void {
		this.inBackground("release reservation", reservationId, () =>
			this.store.release(reservationId),
		);
	}

	/** Boot sweep: close every row this instance left open before it restarted. */
	public async closeLeftovers(): Promise<number> {
		const closed = await this.repository.closeLeftovers(this.instanceId);
		if (closed > 0) {
			this.logger.warn("Closed reserved duels left open by a previous run", {
				instanceId: this.instanceId,
				closed,
			});
		}

		return closed;
	}

	private inBackground(what: string, reservationId: string, write: () => Promise<unknown>): void {
		void retryWithBackoff(write, this.retryPolicy).catch((error: unknown) => {
			this.logger.error(`Reserved duel: ${what} failed`, {
				reservationId,
				error: error instanceof Error ? error.message : String(error),
			});
		});
	}
}

/**
 * Process-wide access point, set once at boot when the stores are available.
 * Unconfigured (no Postgres or no Redis), reserved joins are refused.
 */
export class ReservedDuels {
	private static services: ReservedDuelServices | null = null;

	public static configure(services: ReservedDuelServices): void {
		ReservedDuels.services = services;
	}

	public static current(): ReservedDuelServices | null {
		return ReservedDuels.services;
	}

	/** Test seam. */
	public static reset(): void {
		ReservedDuels.services = null;
	}
}
