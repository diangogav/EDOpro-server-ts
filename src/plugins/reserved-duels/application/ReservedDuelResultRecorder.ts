import { DomainEventSubscriber } from "@shared/event-bus/EventBus";
import { Logger } from "@shared/logger/domain/Logger";
import { PlayerMatchSummary } from "@shared/player/domain/Player";
import {
	DEFAULT_RETRY_POLICY,
	RetryPolicy,
	retryWithBackoff,
} from "@shared/reserved-duel/application/retryWithBackoff";
import {
	ReservedDuelGame,
	ReservedDuelRepository,
	ReservedDuelResult,
} from "@shared/reserved-duel/domain/ReservedDuelRepository";
import { GameOverDomainEvent } from "@shared/room/domain/match/domain/domain-events/GameOverDomainEvent";
import { Team } from "@shared/room/Team";

function gameWinnerSeat(reference: PlayerMatchSummary, index: number): number | null {
	const result = reference.games[index]?.result;
	if (result === "winner") {
		return reference.team;
	}
	if (result === "loser") {
		return reference.team === Team.PLAYER ? Team.OPPONENT : Team.PLAYER;
	}

	return null;
}

/**
 * The outcome of a reserved room's match, from the game-over event: seats are
 * teams, a tied score is a draw (a single reserved duel ends on its first duel,
 * a drawn one included), otherwise the winning team is the winner seat.
 */
export function reservedDuelResult(event: GameOverDomainEvent): ReservedDuelResult | null {
	const { players, matchId } = event.data;
	const seat0 = players.find((player) => player.team === Team.PLAYER);
	const seat1 = players.find((player) => player.team === Team.OPPONENT);
	if (!seat0 || !seat1) {
		return null;
	}

	const reasons = event.data.duelWinReasons ?? [];
	const duels: ReservedDuelGame[] = seat0.games.map((_, index) => ({
		winnerSeat: gameWinnerSeat(seat0, index),
		reason: reasons[index] ?? "unknown",
	}));
	const reason = duels.at(-1)?.reason ?? "unknown";

	if (seat0.score === seat1.score) {
		return { outcome: "draw", winnerSeat: null, reason, matchId, duels };
	}

	return {
		outcome: "decided",
		winnerSeat: seat0.score > seat1.score ? Team.PLAYER : Team.OPPONENT,
		reason,
		matchId,
		duels,
	};
}

/**
 * Records the decided or drawn outcome of a reserved room. The write only
 * lands on a still-open row, so a duplicate event or a retry never rewrites a
 * result, and rooms closed without a game over keep the abandon the core wrote.
 */
export class ReservedDuelResultRecorder implements DomainEventSubscriber<GameOverDomainEvent> {
	static readonly ListenTo = GameOverDomainEvent.DOMAIN_EVENT;
	private readonly logger: Logger;

	constructor(
		logger: Logger,
		private readonly repository: ReservedDuelRepository,
		private readonly retryPolicy: RetryPolicy = DEFAULT_RETRY_POLICY,
	) {
		this.logger = logger.child({ file: "ReservedDuelResultRecorder" });
	}

	async handle(event: GameOverDomainEvent): Promise<void> {
		const reservationId = event.data.reservationId;
		if (!reservationId) {
			return;
		}

		const result = reservedDuelResult(event);
		if (!result) {
			this.logger.error("Reserved duel game over without both seats", { reservationId });
			return;
		}

		try {
			const written = await retryWithBackoff(
				() => this.repository.recordResult(reservationId, result),
				this.retryPolicy,
			);
			if (!written) {
				this.logger.warn("Reserved duel already closed; result not recorded", { reservationId });
			}
		} catch (error) {
			this.logger.error("Recording a reserved duel result failed", {
				reservationId,
				error: error instanceof Error ? error.message : String(error),
			});
		}
	}
}
