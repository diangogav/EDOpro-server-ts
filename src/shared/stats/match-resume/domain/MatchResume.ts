export interface MatchResumeData {
	readonly id: string;
	readonly userId: string;
	readonly gameId: string;
	readonly bestOf: number;
	readonly playerNames: string[];
	readonly opponentNames: string[];
	readonly playerIds: string[];
	readonly opponentIds: string[];
	readonly date: Date;
	readonly banListName: string;
	readonly banListHash: string;
	readonly playerScore: number;
	readonly opponentScore: number;
	readonly winner: boolean;
	readonly season: number;
	readonly points: number;
}

export class MatchResume {
	private constructor(readonly data: MatchResumeData) {}

	static create(data: MatchResumeData): MatchResume {
		return new MatchResume(data);
	}
}
