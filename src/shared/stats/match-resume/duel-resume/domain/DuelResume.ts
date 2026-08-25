export interface DuelResumeData {
	readonly id: string;
	readonly userId: string;
	readonly gameId: string;
	readonly playerNames: string[];
	readonly opponentNames: string[];
	readonly date: Date;
	readonly banListName: string;
	readonly banListHash: string;
	readonly result: string;
	readonly turns: number;
	readonly matchId: string;
	/** Cross-player correlation key of the game; null when the emitter could not provide one. */
	readonly duelId: string | null;
	readonly season: number;
	readonly ipAddress: string | null;
}

export class DuelResume {
	private constructor(readonly data: DuelResumeData) {}

	static create(data: DuelResumeData): DuelResume {
		return new DuelResume(data);
	}
}
