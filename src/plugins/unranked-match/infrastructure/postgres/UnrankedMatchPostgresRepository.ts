import { dataSource } from "../../../../evolution-types/src/data-source";
import { UnrankedDuelEntity } from "../../../../evolution-types/src/entities/UnrankedDuelEntity";
import { UnrankedMatchEntity } from "../../../../evolution-types/src/entities/UnrankedMatchEntity";
import { UnrankedDuel } from "../../domain/UnrankedDuel";
import { UnrankedMatch } from "../../domain/UnrankedMatch";
import { UnrankedMatchRepository } from "../../domain/UnrankedMatchRepository";

export class UnrankedMatchPostgresRepository implements UnrankedMatchRepository {
	async saveMatch(unrankedMatch: UnrankedMatch): Promise<void> {
		const repository = dataSource.getRepository(UnrankedMatchEntity);
		const entity = repository.create({
			id: unrankedMatch.data.id,
			gameId: unrankedMatch.data.gameId,
			bestOf: unrankedMatch.data.bestOf,
			playerNames: unrankedMatch.data.playerNames,
			opponentNames: unrankedMatch.data.opponentNames,
			date: unrankedMatch.data.date,
			banListName: unrankedMatch.data.banListName,
			banListHash: unrankedMatch.data.banListHash,
			team0Score: unrankedMatch.data.team0Score,
			team1Score: unrankedMatch.data.team1Score,
			winnerTeam: unrankedMatch.data.winnerTeam,
			season: unrankedMatch.data.season,
		});
		await repository.save(entity);
	}

	async saveDuel(unrankedDuel: UnrankedDuel): Promise<void> {
		const repository = dataSource.getRepository(UnrankedDuelEntity);
		const entity = repository.create({
			id: unrankedDuel.data.id,
			gameId: unrankedDuel.data.gameId,
			date: unrankedDuel.data.date,
			banListName: unrankedDuel.data.banListName,
			banListHash: unrankedDuel.data.banListHash,
			team0Score: unrankedDuel.data.team0Score,
			team1Score: unrankedDuel.data.team1Score,
			winnerTeam: unrankedDuel.data.winnerTeam,
			turns: unrankedDuel.data.turns,
			matchId: unrankedDuel.data.matchId,
			season: unrankedDuel.data.season,
			ipAddress: unrankedDuel.data.ipAddress,
		});
		await repository.save(entity);
	}
}
