import { mock, MockProxy } from "jest-mock-extended";
import { Logger } from "src/shared/logger/domain/Logger";
import { UnrankedMatchRepository } from "../domain/UnrankedMatchRepository";
import { UnrankedMatchSaver } from "./UnrankedMatchSaver";
import { GameOverDomainEvent } from "src/shared/room/domain/match/domain/domain-events/GameOverDomainEvent";
import { Team } from "src/shared/room/Team";
import { PlayerMatchSummary } from "src/shared/player/domain/Player";
import { PlayerMother } from "@test-support/mothers/player/PlayerMother";
import { GameMother } from "@test-support/mothers/player/GameMother";

describe("UnrankedMatchSaver", () => {
	let logger: MockProxy<Logger>;
	let unrankedMatchRepository: MockProxy<UnrankedMatchRepository>;
	let unrankedMatchSaver: UnrankedMatchSaver;

	beforeEach(() => {
		logger = mock<Logger>();
		logger.child.mockReturnValue(logger);
		unrankedMatchRepository = mock<UnrankedMatchRepository>();
		unrankedMatchSaver = new UnrankedMatchSaver(logger, unrankedMatchRepository);
	});

	it("should NOT save if match is ranked", async () => {
		const event = new GameOverDomainEvent({
			roomId: 7,
			matchId: "match-uuid-1",
			duelIds: ["duel-uuid-1"],
			ranked: true,
			players: [],
			bestOf: 1,
			date: new Date(),
			banListHash: 123,
			banListName: "N/A",
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
			roomId: 7,
			matchId: "match-uuid-1",
			duelIds: ["duel-uuid-1"],
			ranked: false,
			players: [playerTeam0, playerTeam1],
			bestOf: 1,
			date: new Date(),
			banListHash: 123,
			banListName: "2010.03 Edison",
		});

		await unrankedMatchSaver.handle(event);

		expect(unrankedMatchRepository.saveMatch).toHaveBeenCalledTimes(1);
		expect(unrankedMatchRepository.saveDuel).toHaveBeenCalledTimes(1);

		const capturedMatch = unrankedMatchRepository.saveMatch.mock.calls[0][0];
		expect(capturedMatch.data.team0Score).toBe(1);
		expect(capturedMatch.data.team1Score).toBe(0);
		expect(capturedMatch.data.winnerTeam).toBe(0);
		expect(capturedMatch.data.playerNames).toContain("Player0");
		expect(capturedMatch.data.opponentNames).toContain("Player1");
		expect(capturedMatch.data.banListName).toBe("2010.03 Edison");

		const capturedDuel = unrankedMatchRepository.saveDuel.mock.calls[0][0];
		expect(capturedDuel.data.team0Score).toBe(1);
		expect(capturedDuel.data.team1Score).toBe(0);
		expect(capturedDuel.data.winnerTeam).toBe(0);
		expect(capturedDuel.data.banListName).toBe("2010.03 Edison");
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
			roomId: 7,
			matchId: "match-uuid-1",
			duelIds: ["duel-uuid-1"],
			ranked: false,
			players: [playerTeam0],
			bestOf: 1,
			date: new Date(),
			banListHash: 123,
			banListName: "N/A",
		});

		await unrankedMatchSaver.handle(event);

		expect(unrankedMatchRepository.saveMatch).not.toHaveBeenCalled();
	});

	it("uses the event's matchId as the persisted gameId instead of inventing one", async () => {
		const event = new GameOverDomainEvent({
			ranked: false,
			players: [
				PlayerMother.create({ team: Team.PLAYER }).toPresentation(),
				PlayerMother.create({ team: Team.OPPONENT }).toPresentation(),
			],
			bestOf: 1,
			date: new Date(),
			banListHash: 123,
			banListName: "N/A",
			roomId: 7,
			matchId: "match-uuid-1",
			duelIds: ["duel-uuid-1"],
		});

		await unrankedMatchSaver.handle(event);

		expect(unrankedMatchRepository.saveMatch).toHaveBeenCalledWith(
			expect.objectContaining({ data: expect.objectContaining({ gameId: "match-uuid-1" }) }),
		);
	});

	// unranked_matches rows are one per match, so the row id IS the match:
	// duplicate GAME_OVER publications hit the primary key instead of
	// duplicating the row.
	it("persists the match row under the real matchId", async () => {
		const event = new GameOverDomainEvent({
			ranked: false,
			players: [
				PlayerMother.create({ team: Team.PLAYER }).toPresentation(),
				PlayerMother.create({ team: Team.OPPONENT }).toPresentation(),
			],
			bestOf: 1,
			date: new Date(),
			banListHash: 123,
			banListName: "N/A",
			roomId: 7,
			matchId: "match-uuid-1",
			duelIds: ["duel-uuid-1"],
		});

		await unrankedMatchSaver.handle(event);

		expect(unrankedMatchRepository.saveMatch).toHaveBeenCalledWith(
			expect.objectContaining({ data: expect.objectContaining({ id: "match-uuid-1" }) }),
		);
	});

	it("persists each duel row under its real duelId when the event carries one per game", async () => {
		const event = new GameOverDomainEvent({
			ranked: false,
			players: [
				PlayerMother.create({
					team: Team.PLAYER,
					games: [GameMother.create(), GameMother.create()],
				}).toPresentation(),
				PlayerMother.create({ team: Team.OPPONENT }).toPresentation(),
			],
			bestOf: 3,
			date: new Date(),
			banListHash: 123,
			banListName: "N/A",
			roomId: 7,
			matchId: "match-uuid-1",
			duelIds: ["duel-uuid-1", "duel-uuid-2"],
		});

		await unrankedMatchSaver.handle(event);

		expect(unrankedMatchRepository.saveDuel).toHaveBeenCalledTimes(2);
		expect(unrankedMatchRepository.saveDuel).toHaveBeenNthCalledWith(
			1,
			expect.objectContaining({ data: expect.objectContaining({ id: "duel-uuid-1" }) }),
		);
		expect(unrankedMatchRepository.saveDuel).toHaveBeenNthCalledWith(
			2,
			expect.objectContaining({ data: expect.objectContaining({ id: "duel-uuid-2" }) }),
		);
	});

	it("falls back to a random id and warns when duelIds do not match the games count", async () => {
		const event = new GameOverDomainEvent({
			ranked: false,
			players: [
				PlayerMother.create({
					team: Team.PLAYER,
					games: [GameMother.create(), GameMother.create()],
				}).toPresentation(),
				PlayerMother.create({ team: Team.OPPONENT }).toPresentation(),
			],
			bestOf: 3,
			date: new Date(),
			banListHash: 123,
			banListName: "N/A",
			roomId: 7,
			matchId: "match-uuid-1",
			duelIds: ["duel-uuid-1"],
		});

		await unrankedMatchSaver.handle(event);

		expect(unrankedMatchRepository.saveDuel).toHaveBeenCalledTimes(2);
		const savedIds = unrankedMatchRepository.saveDuel.mock.calls.map(
			([duel]) => (duel as { data: { id: string } }).data.id,
		);
		expect(savedIds).not.toContain("duel-uuid-1");
		expect(logger.warn).toHaveBeenCalled();
	});
});
