import { Participant } from "../domain/Participant";
import { PoolStore } from "../domain/PoolStore";
import { MatchmakingFormat, MatchmakingMode } from "../domain/QueueEntry";

function poolKey(format: MatchmakingFormat, mode: MatchmakingMode): string {
	return `${format}:${mode}`;
}

/**
 * In-process `PoolStore` implementation. Keeps a participant-id index and a
 * userId index in sync, plus a per-pool-key id set for O(1) depth reads.
 */
export class InMemoryPoolStore implements PoolStore {
	private readonly byId = new Map<string, Participant>();
	private readonly byUserId = new Map<string, string>();
	private readonly idsByPoolKey = new Map<string, Set<string>>();

	add(participant: Participant): void {
		this.byId.set(participant.id, participant);
		this.byUserId.set(participant.userId, participant.id);

		const key = poolKey(participant.format, participant.mode);
		const ids = this.idsByPoolKey.get(key) ?? new Set<string>();
		ids.add(participant.id);
		this.idsByPoolKey.set(key, ids);
	}

	get(id: string): Participant | undefined {
		return this.byId.get(id);
	}

	findByUserId(userId: string): Participant | undefined {
		const id = this.byUserId.get(userId);
		return id === undefined ? undefined : this.byId.get(id);
	}

	remove(id: string): void {
		const participant = this.byId.get(id);
		if (!participant) return;

		this.byId.delete(id);

		// Only clear the userId index if it still points at this participant —
		// a same-user replacement may have already added a new one under it.
		if (this.byUserId.get(participant.userId) === id) {
			this.byUserId.delete(participant.userId);
		}

		this.idsByPoolKey.get(poolKey(participant.format, participant.mode))?.delete(id);
	}

	all(format: MatchmakingFormat, mode: MatchmakingMode): readonly Participant[] {
		const ids = this.idsByPoolKey.get(poolKey(format, mode));
		if (!ids) return [];

		const participants: Participant[] = [];
		for (const id of ids) {
			const participant = this.byId.get(id);
			if (participant) participants.push(participant);
		}
		return participants;
	}

	depth(format: MatchmakingFormat, mode: MatchmakingMode): number {
		return this.idsByPoolKey.get(poolKey(format, mode))?.size ?? 0;
	}
}
