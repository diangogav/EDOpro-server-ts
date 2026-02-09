import { dataSource } from "../../../../../evolution-types/src/data-source";
import { UnrankedDuelEntity } from "../../../../../evolution-types/src/entities/UnrankedDuelEntity";
import { UnrankedMatchEntity } from "../../../../../evolution-types/src/entities/UnrankedMatchEntity";
import { UnrankedDuel } from "../../domain/UnrankedDuel";
import { UnrankedMatch } from "../../domain/UnrankedMatch";
import { UnrankedMatchRepository } from "../../domain/UnrankedMatchRepository";

export class UnrankedMatchPostgresRepository implements UnrankedMatchRepository {
    async saveMatch(unrankedMatch: UnrankedMatch): Promise<void> {
        const repository = dataSource.getRepository(UnrankedMatchEntity);
        const entity = repository.create({
            id: unrankedMatch.id,
            gameId: unrankedMatch.gameId,
            bestOf: unrankedMatch.bestOf,
            playerNames: unrankedMatch.playerNames,
            opponentNames: unrankedMatch.opponentNames,
            date: unrankedMatch.date,
            banListName: unrankedMatch.banListName,
            banListHash: unrankedMatch.banListHash,
            team0Score: unrankedMatch.team0Score,
            team1Score: unrankedMatch.team1Score,
            winnerTeam: unrankedMatch.winnerTeam,
            season: unrankedMatch.season,
        });
        await repository.save(entity);
    }

    async saveDuel(unrankedDuel: UnrankedDuel): Promise<void> {
        const repository = dataSource.getRepository(UnrankedDuelEntity);
        const entity = repository.create({
            id: unrankedDuel.id,
            gameId: unrankedDuel.gameId,
            date: unrankedDuel.date,
            banListName: unrankedDuel.banListName,
            banListHash: unrankedDuel.banListHash,
            team0Score: unrankedDuel.team0Score,
            team1Score: unrankedDuel.team1Score,
            winnerTeam: unrankedDuel.winnerTeam,
            turns: unrankedDuel.turns,
            matchId: unrankedDuel.matchId,
            season: unrankedDuel.season,
            ipAddress: unrankedDuel.ipAddress,
        });
        await repository.save(entity);
    }
}
