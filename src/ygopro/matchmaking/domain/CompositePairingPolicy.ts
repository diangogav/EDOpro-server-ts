import { Match } from "./Match";
import { PairingPolicy } from "./PairingPolicy";
import { Participant } from "./Participant";

/**
 * Runs each policy in order, feeding the next policy only the participants
 * still unmatched by the previous ones. Guarantees no participant is ever
 * assigned to more than one `Match`.
 */
export class CompositePairingPolicy implements PairingPolicy {
	constructor(private readonly policies: readonly PairingPolicy[]) {}

	pair(candidates: readonly Participant[], now: number): readonly Match[] {
		const matches: Match[] = [];
		let remaining = candidates;

		for (const policy of this.policies) {
			const policyMatches = policy.pair(remaining, now);
			if (policyMatches.length === 0) continue;

			matches.push(...policyMatches);

			const matchedIds = new Set(
				policyMatches.flatMap((match) => match.participants.map((participant) => participant.id)),
			);
			remaining = remaining.filter((participant) => !matchedIds.has(participant.id));
		}

		return matches;
	}
}
