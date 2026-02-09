import { mock, MockProxy } from "jest-mock-extended";
import { Logger } from "src/shared/logger/domain/Logger";
import { UnrankedMatchRepository } from "../domain/UnrankedMatchRepository";
import { UnrankedMatchSaver } from "./UnrankedMatchSaver";
import { GameOverDomainEvent } from "src/shared/room/domain/match/domain/domain-events/GameOverDomainEvent";
import { Team } from "src/shared/room/Team";
import { PlayerMatchSummary } from "src/shared/player/domain/Player";

describe("UnrankedMatchSaver", () => {
    let logger: MockProxy<Logger>;
    let unrankedMatchRepository: MockProxy<UnrankedMatchRepository>;
    let unrankedMatchSaver: UnrankedMatchSaver;

    beforeEach(() => {
        logger = mock<Logger>();
        logger.child.mockReturnValue(logger);
        unrankedMatchRepository = mock<UnrankedMatchRepository>();
        unrankedMatchSaver = new UnrankedMatchSaver(
            logger,
            unrankedMatchRepository
        );
    });

    it("should NOT save if match is ranked", async () => {
        const event = new GameOverDomainEvent({
            ranked: true,
            players: [],
            bestOf: 1,
            date: new Date(),
            banListHash: 123,
        });

        await unrankedMatchSaver.handle(event);

        expect(unrankedMatchRepository.saveMatch).not.toHaveBeenCalled();
        expect(unrankedMatchRepository.saveDuel).not.toHaveBeenCalled();
    });

    it("should save single match record and duels if match is unranked", async () => {
        const playerTeam0: PlayerMatchSummary = {
            id: null,
            name: "Player0",
            team: Team.PLAYER,
            winner: true,
            games: [
                {
                    result: "winner",
                    turns: 5,
                    ipAddress: "127.0.0.1",
                },
            ],
            score: 1,
        };

        const playerTeam1: PlayerMatchSummary = {
            id: null,
            name: "Player1",
            team: Team.OPPONENT,
            winner: false,
            games: [
                {
                    result: "loser",
                    turns: 5,
                    ipAddress: "127.0.0.2",
                },
            ],
            score: 0,
        };

        const event = new GameOverDomainEvent({
            ranked: false,
            players: [playerTeam0, playerTeam1],
            bestOf: 1,
            date: new Date(),
            banListHash: 123,
        });

        await unrankedMatchSaver.handle(event);

        expect(unrankedMatchRepository.saveMatch).toHaveBeenCalledTimes(1);
        expect(unrankedMatchRepository.saveDuel).toHaveBeenCalledTimes(1);

        const capturedMatch = unrankedMatchRepository.saveMatch.mock.calls[0][0];
        expect(capturedMatch.team0Score).toBe(1);
        expect(capturedMatch.team1Score).toBe(0);
        expect(capturedMatch.winnerTeam).toBe(0);
        expect(capturedMatch.playerNames).toContain("Player0");
        expect(capturedMatch.opponentNames).toContain("Player1");

        const capturedDuel = unrankedMatchRepository.saveDuel.mock.calls[0][0];
        expect(capturedDuel.team0Score).toBe(1);
        expect(capturedDuel.team1Score).toBe(0);
        expect(capturedDuel.winnerTeam).toBe(0);
        expect(capturedDuel.banListName).toBe("N/A");
    });

    it("should NOT save if players are missing from one team", async () => {
        const playerTeam0: PlayerMatchSummary = {
            id: null,
            name: "Player0",
            team: Team.PLAYER,
            winner: true,
            games: [],
            score: 0,
        };

        const event = new GameOverDomainEvent({
            ranked: false,
            players: [playerTeam0],
            bestOf: 1,
            date: new Date(),
            banListHash: 123,
        });

        await unrankedMatchSaver.handle(event);

        expect(unrankedMatchRepository.saveMatch).not.toHaveBeenCalled();
    });
});
