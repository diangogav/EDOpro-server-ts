import { Match } from "./Match";
import { PairingPolicy } from "./PairingPolicy";
import { Participant } from "./Participant";
import { clampBotFallbackDelay } from "./QueueEntry";

/**
 * Pairs a candidate that carries a fallback delay (`botFallbackAfterMs`) and has
 * waited longer than that delay, clamped to the supported range, with an unrated
 * bot match, one match per participant. Candidates without a delay are never
 * paired here and keep waiting for a human. No-op while no bot is available.
 */
export class BotFallbackPolicy implements PairingPolicy {
	constructor(
		private readonly botAvailable: () => boolean,
		private readonly newMatchId: () => string,
	) {}

	pair(candidates: readonly Participant[], now: number): readonly Match[] {
		if (!this.botAvailable()) return [];

		const matches: Match[] = [];

		for (const participant of candidates) {
			if (participant.botFallbackAfterMs === undefined) continue;
			if (now - participant.enqueuedAt <= clampBotFallbackDelay(participant.botFallbackAfterMs)) {
				continue;
			}

			matches.push({
				id: this.newMatchId(),
				format: participant.format,
				mode: participant.mode,
				rated: false,
				opponentKind: "bot",
				participants: [participant],
			});
		}

		return matches;
	}
}
