import { Match } from "./Match";
import { PairingPolicy } from "./PairingPolicy";
import { Participant } from "./Participant";
import { BOT_FALLBACK_MS } from "./QueueEntry";

/**
 * Pairs a candidate that opted in (`allowBotFallback`) and has waited past
 * `BOT_FALLBACK_MS` with an unrated bot match, one match per participant.
 * Candidates that did not opt in are never paired here and keep waiting for a
 * human. No-op while no bot is available.
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
			if (!participant.allowBotFallback) continue;
			if (now - participant.enqueuedAt <= BOT_FALLBACK_MS) continue;

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
