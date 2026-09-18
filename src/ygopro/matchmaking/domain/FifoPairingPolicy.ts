import { Match } from "./Match";
import { PairingPolicy } from "./PairingPolicy";
import { Participant } from "./Participant";

/**
 * Pairs candidates two at a time, earliest `enqueuedAt` first. An odd
 * participant left over is not paired by this policy.
 */
export class FifoPairingPolicy implements PairingPolicy {
	constructor(private readonly newMatchId: () => string) {}

	pair(candidates: readonly Participant[], _now: number): readonly Match[] {
		const ordered = [...candidates].sort((a, b) => a.enqueuedAt - b.enqueuedAt);
		const matches: Match[] = [];

		for (let i = 0; i + 1 < ordered.length; i += 2) {
			const first = ordered[i];
			const second = ordered[i + 1];

			matches.push({
				id: this.newMatchId(),
				format: first.format,
				mode: first.mode,
				rated: true,
				opponentKind: "human",
				participants: [first, second],
			});
		}

		return matches;
	}
}
