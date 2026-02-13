import { randomUUID } from "crypto";

import { MatchResumeRepository } from "../../domain/MatchResumeRepository";
import { DuelResume } from "../domain/DuelResume";

export class DuelResumeCreator {
	constructor(private readonly matchResumeRepository: MatchResumeRepository) { }

	async run(payload: {
		userId: string;
		gameId: string;
		playerNames: string[];
		opponentNames: string[];
		date: Date;
		banListName: string;
		banListHash: string;
		result: string;
		turns: number;
		matchId: string;
		season: number;
		ipAddress: string | null;
	}): Promise<{ id: string }> {
		const id = randomUUID();
		const duelResume = DuelResume.create({ id, ...payload });
		await this.matchResumeRepository.createDuelResume(duelResume);

		return { id };
	}
}
