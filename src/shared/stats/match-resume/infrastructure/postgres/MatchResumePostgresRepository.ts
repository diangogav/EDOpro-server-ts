import { dataSource } from "src/shared/db/postgres/infrastructure/data-source";

import { MatchResume } from "../../domain/MatchResume";
import { MatchResumeRepository } from "../../domain/MatchResumeRepository";
import { DuelResume } from "../../duel-resume/domain/DuelResume";
import { DuelResumeEntity } from "../../duel-resume/infrastructure/DuelResumeEntity";
import { MatchResumeEntity } from "../MatchResumeEntity";

export class MatchResumePostgresRepository implements MatchResumeRepository {
	async create(matchResume: MatchResume): Promise<void> {
		const repository = dataSource.getRepository(MatchResumeEntity);
		const matchResumeEntity = repository.create({
			id: matchResume.id,
			userId: matchResume.userId,
			bestOf: matchResume.bestOf,
			playerName: matchResume.playerName,
			opponentName: matchResume.opponentName,
			date: matchResume.date,
			banListName: matchResume.banListName,
			banListHash: matchResume.banListHash,
			playerScore: matchResume.playerScore,
			opponentScore: matchResume.opponentScore,
			winner: matchResume.winner,
			season: matchResume.season,
		});
		await repository.save(matchResumeEntity);
	}

	async createDuelResume(duelResume: DuelResume): Promise<void> {
		const repository = dataSource.getRepository(DuelResumeEntity);
		const duelResumeEntity = repository.create({
			id: duelResume.id,
			userId: duelResume.userId,
			playerName: duelResume.playerName,
			opponentName: duelResume.opponentName,
			date: duelResume.date,
			banListName: duelResume.banListName,
			banListHash: duelResume.banListHash,
			result: duelResume.result,
			turns: duelResume.turns,
			matchId: duelResume.matchId,
			season: duelResume.season,
		});
		await repository.save(duelResumeEntity);
	}
}
