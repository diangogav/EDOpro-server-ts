import { Match } from "./Match";
import { Participant } from "./Participant";

/** A human match held out of the pairing pool until every participant accepts. */
export interface PendingMatch {
	readonly match: Match;
	/** Absolute time (pool clock) at which unanswered participants time out. */
	readonly deadline: number;
	/** Ids that accepted; a participant not opted into the accept step starts here. */
	readonly accepted: Set<string>;
}

export interface PendingParticipant {
	readonly pending: PendingMatch;
	readonly participant: Participant;
}

/** In-memory book of matches awaiting ACCEPT/DECLINE, keyed by match id. */
export class PendingMatches {
	private readonly byMatchId = new Map<string, PendingMatch>();

	public add(match: Match, deadline: number): void {
		const accepted = new Set(
			match.participants
				.filter((participant) => participant.supportsAcceptStep !== true)
				.map((participant) => participant.id),
		);
		this.byMatchId.set(match.id, { match, deadline, accepted });
	}

	public get(matchId: string): PendingMatch | undefined {
		return this.byMatchId.get(matchId);
	}

	public delete(matchId: string): void {
		this.byMatchId.delete(matchId);
	}

	public all(): readonly PendingMatch[] {
		return [...this.byMatchId.values()];
	}

	public findByParticipantId(id: string): PendingParticipant | undefined {
		return this.find((participant) => participant.id === id);
	}

	public findByUserId(userId: string): PendingParticipant | undefined {
		return this.find((participant) => participant.userId === userId);
	}

	private find(predicate: (participant: Participant) => boolean): PendingParticipant | undefined {
		for (const pending of this.byMatchId.values()) {
			const participant = pending.match.participants.find(predicate);
			if (participant) return { pending, participant };
		}

		return undefined;
	}
}
