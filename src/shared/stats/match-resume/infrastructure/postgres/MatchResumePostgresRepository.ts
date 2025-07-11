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
			id: matchResume.id,
			userId: matchResume.userId,
			bestOf: matchResume.bestOf,
			playerNames: matchResume.playerNames,
			opponentNames: matchResume.opponentNames,
			playerIds: matchResume.playerIds,
			opponentIds: matchResume.opponentIds,
			date: matchResume.date,
			banListName: matchResume.banListName,
			banListHash: matchResume.banListHash,
			playerScore: matchResume.playerScore,
			opponentScore: matchResume.opponentScore,
			winner: matchResume.winner,
			season: matchResume.season,
			points: matchResume.points,
		});
		await repository.save(matchResumeEntity);
	}

	async createDuelResume(duelResume: DuelResume): Promise<void> {
		const repository = dataSource.getRepository(DuelResumeEntity);
		const duelResumeEntity = repository.create({
			id: duelResume.id,
			userId: duelResume.userId,
			playerNames: duelResume.playerNames,
			opponentNames: duelResume.opponentNames,
			date: duelResume.date,
			banListName: duelResume.banListName,
			banListHash: duelResume.banListHash,
			result: duelResume.result,
			turns: duelResume.turns,
			matchId: duelResume.matchId,
			season: duelResume.season,
			ipAddress: duelResume.ipAddress,
		});
		await repository.save(duelResumeEntity);
	}
}
