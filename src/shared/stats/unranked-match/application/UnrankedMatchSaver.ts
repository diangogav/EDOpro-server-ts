import { randomUUID } from "node:crypto";
import BanListMemoryRepository from "@edopro/ban-list/infrastructure/BanListMemoryRepository";
import { DomainEventSubscriber } from "src/shared/event-bus/EventBus";
import { Logger } from "src/shared/logger/domain/Logger";
import { GameOverDomainEvent } from "src/shared/room/domain/match/domain/domain-events/GameOverDomainEvent";
import { config } from "src/config";
import { UnrankedMatchRepository } from "../domain/UnrankedMatchRepository";
import { UnrankedMatch } from "../domain/UnrankedMatch";
import { UnrankedDuel } from "../domain/UnrankedDuel";
import { Team } from "src/shared/room/Team";

export class UnrankedMatchSaver implements DomainEventSubscriber<GameOverDomainEvent> {
    static readonly ListenTo = GameOverDomainEvent.DOMAIN_EVENT;

    constructor(
        private readonly logger: Logger,
        private readonly unrankedMatchRepository: UnrankedMatchRepository
    ) {
        this.logger = logger.child({ file: "UnrankedMatchSaver" });
    }

    async handle(event: GameOverDomainEvent): Promise<void> {
        if (event.data.ranked) {
            return;
        }

        const team0Players = event.data.players.filter((p) => p.team === Team.PLAYER);
        const team1Players = event.data.players.filter((p) => p.team === Team.OPPONENT);

        if (team0Players.length === 0 || team1Players.length === 0) {
            return;
        }

        this.logger.info(
            `Processing unranked match: Team 0 (${team0Players.map(p => p.name).join(", ")}) vs Team 1 (${team1Players.map(p => p.name).join(", ")})`
        );

        const gameId = randomUUID();
        const banList = BanListMemoryRepository.findByHash(event.data.banListHash);
        const banListName = banList?.name ?? "N/A";
        const banListHash = event.data.banListHash.toString();

        // Use the first player of Team 0 as reference for scores and result
        const referencePlayer = team0Players[0];
        const matchId = randomUUID();

        const unrankedMatch = UnrankedMatch.create({
            id: matchId,
            gameId: gameId,
            bestOf: event.data.bestOf,
            playerNames: team0Players.map((p) => p.name),
            opponentNames: team1Players.map((p) => p.name),
            date: event.data.date,
            banListName,
            banListHash,
            team0Score: referencePlayer.score,
            team1Score: team1Players[0].score, // Assuming simple 1v1 or team consensus
            winnerTeam: referencePlayer.winner ? 0 : 1,
            season: config.season,
        });

        await this.unrankedMatchRepository.saveMatch(unrankedMatch);
        this.logger.info(`Unranked match saved: ${matchId}`);

        for (const game of referencePlayer.games) {
            const unrankedDuel = UnrankedDuel.create({
                id: randomUUID(),
                gameId: gameId,
                date: event.data.date,
                banListName,
                banListHash,
                team0Score: referencePlayer.score, // Or should it be individual game result?
                team1Score: team1Players[0].score, // Match score is usually what's tracked
                winnerTeam: referencePlayer.winner ? 0 : 1,
                turns: game.turns,
                matchId: matchId,
                season: config.season,
                ipAddress: game.ipAddress,
            });

            await this.unrankedMatchRepository.saveDuel(unrankedDuel);
        }
    }
}
