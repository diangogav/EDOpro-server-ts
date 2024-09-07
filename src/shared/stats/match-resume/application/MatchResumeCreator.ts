import { randomUUID } from "crypto";

import { MatchResume } from "../domain/MatchResume";
import { MatchResumeRepository } from "../domain/MatchResumeRepository";

export class MatchResumeCreator {
	constructor(private readonly matchResumeRepository: MatchResumeRepository) {}

	async run(payload: {
		userId: string;
		bestOf: number;
		playerNames: string[];
		opponentNames: string[];
		date: Date;
		banListName: string;
		banListHash: string;
		playerScore: number;
		opponentScore: number;
		winner: boolean;
		season: number;
	}): Promise<{ id: string }> {
		const id = randomUUID();
		const matchResume = MatchResume.create({ id, ...payload });
		await this.matchResumeRepository.create(matchResume);

		return { id };
	}
}
