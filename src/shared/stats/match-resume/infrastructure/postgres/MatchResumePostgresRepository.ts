import { dataSource } from "../../../../../evolution-types/src/data-source";
import { DuelResumeEntity } from "../../../../../evolution-types/src/entities/DuelResumeEntity";
import { MatchResumeEntity } from "../../../../../evolution-types/src/entities/MatchResumeEntity";
import { MatchResume } from "../../domain/MatchResume";
import { MatchResumeRepository } from "../../domain/MatchResumeRepository";
import { DuelResume } from "../../duel-resume/domain/DuelResume";

export class MatchResumePostgresRepository implements MatchResumeRepository {
	async create(matchResume: MatchResume): Promise<void> {
		const repository = dataSource.getRepository(MatchResumeEntity);
		const matchResumeEntity = repository.create({
			id: matchResume.data.id,
			userId: matchResume.data.userId,
			gameId: matchResume.data.gameId,
			bestOf: matchResume.data.bestOf,
			playerNames: matchResume.data.playerNames,
			opponentNames: matchResume.data.opponentNames,
			playerIds: matchResume.data.playerIds,
			opponentIds: matchResume.data.opponentIds,
			date: matchResume.data.date,
			banListName: matchResume.data.banListName,
			banListHash: matchResume.data.banListHash,
			playerScore: matchResume.data.playerScore,
			opponentScore: matchResume.data.opponentScore,
			winner: matchResume.data.winner,
			season: matchResume.data.season,
			points: matchResume.data.points,
		});
		await repository.save(matchResumeEntity);
	}

	async createDuelResume(duelResume: DuelResume): Promise<void> {
		const repository = dataSource.getRepository(DuelResumeEntity);
		const duelResumeEntity = repository.create({
			id: duelResume.data.id,
			userId: duelResume.data.userId,
			gameId: duelResume.data.gameId,
			playerNames: duelResume.data.playerNames,
			opponentNames: duelResume.data.opponentNames,
			date: duelResume.data.date,
			banListName: duelResume.data.banListName,
			banListHash: duelResume.data.banListHash,
			result: duelResume.data.result,
			turns: duelResume.data.turns,
			matchId: duelResume.data.matchId,
			duelId: duelResume.data.duelId,
			season: duelResume.data.season,
			ipAddress: duelResume.data.ipAddress,
		});
		await repository.save(duelResumeEntity);
	}
}
