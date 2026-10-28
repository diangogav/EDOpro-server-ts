import { ReservedDuelRepository } from "@shared/reserved-duel/domain/ReservedDuelRepository";
import { Team } from "@shared/room/Team";
import { GameMother } from "@test-support/mothers/player/GameMother";
import { GameOverDomainEventMother } from "@test-support/mothers/player/GameOverDomainEventMother";
import { PlayerMother } from "@test-support/mothers/player/PlayerMother";
import { LoggerMock } from "@test-support/mocks/logger/LoggerMock";

import { ReservedDuelResultRecorder } from "./ReservedDuelResultRecorder";

const ID = "Ab3dEf6hIj9kLm2n";

type Result = "winner" | "loser" | "deuce";

const players = (seat0: Result[], seat1: Result[], score0: number, score1: number) => [
	PlayerMother.create({
		team: Team.PLAYER,
		score: score0,
		winner: score0 > score1,
		games: seat0.map((result) => GameMother.create({ result })),
	}).toPresentation(),
	PlayerMother.create({
		team: Team.OPPONENT,
		score: score1,
		winner: score1 >= score0,
		games: seat1.map((result) => GameMother.create({ result })),
	}).toPresentation(),
];

const makeRepository = (): jest.Mocked<ReservedDuelRepository> => ({
	open: jest.fn(),
	claimSeat: jest.fn(),
	markStarted: jest.fn(),
	recordAbandon: jest.fn(),
	recordResult: jest.fn().mockResolvedValue(true),
	exists: jest.fn().mockResolvedValue(false),
	closeLeftovers: jest.fn(),
});

const makeRecorder = (repository: ReservedDuelRepository) =>
	new ReservedDuelResultRecorder(new LoggerMock(), repository, { attempts: 3, baseDelayMs: 0 });

describe("ReservedDuelResultRecorder", () => {
	it("records seat 0 as the winner of a decided single duel", async () => {
		const repository = makeRepository();
		const event = GameOverDomainEventMother.create({
			matchId: "match-1",
			reservationId: ID,
			duelWinReasons: ["1"],
			players: players(["winner"], ["loser"], 1, 0),
		});

		await makeRecorder(repository).handle(event);

		expect(repository.recordResult).toHaveBeenCalledWith(ID, {
			outcome: "decided",
			winnerSeat: 0,
			reason: "1",
			matchId: "match-1",
			duels: [{ winnerSeat: 0, reason: "1" }],
		});
	});

	it("records seat 1 as the winner, with one entry per duel of a match", async () => {
		const repository = makeRepository();
		const event = GameOverDomainEventMother.create({
			matchId: "match-2",
			reservationId: ID,
			duelWinReasons: ["1", "2", "disconnect"],
			players: players(["winner", "loser", "loser"], ["loser", "winner", "winner"], 1, 2),
		});

		await makeRecorder(repository).handle(event);

		expect(repository.recordResult).toHaveBeenCalledWith(ID, {
			outcome: "decided",
			winnerSeat: 1,
			reason: "disconnect",
			matchId: "match-2",
			duels: [
				{ winnerSeat: 0, reason: "1" },
				{ winnerSeat: 1, reason: "2" },
				{ winnerSeat: 1, reason: "disconnect" },
			],
		});
	});

	it("records a drawn single duel as a draw with no winner seat", async () => {
		const repository = makeRepository();
		const event = GameOverDomainEventMother.create({
			matchId: "match-3",
			reservationId: ID,
			duelWinReasons: ["0"],
			players: players(["deuce"], ["deuce"], 0, 0),
		});

		await makeRecorder(repository).handle(event);

		expect(repository.recordResult).toHaveBeenCalledWith(ID, {
			outcome: "draw",
			winnerSeat: null,
			reason: "0",
			matchId: "match-3",
			duels: [{ winnerSeat: null, reason: "0" }],
		});
	});

	it("ignores a match that was not reserved", async () => {
		const repository = makeRepository();

		await makeRecorder(repository).handle(GameOverDomainEventMother.create());

		expect(repository.recordResult).not.toHaveBeenCalled();
	});

	it("retries a failed write", async () => {
		const repository = makeRepository();
		repository.recordResult.mockRejectedValueOnce(new Error("db down")).mockResolvedValueOnce(true);
		const event = GameOverDomainEventMother.create({
			reservationId: ID,
			players: players(["winner"], ["loser"], 1, 0),
		});

		await makeRecorder(repository).handle(event);

		expect(repository.recordResult).toHaveBeenCalledTimes(2);
	});

	it("swallows a write that keeps failing", async () => {
		const repository = makeRepository();
		repository.recordResult.mockRejectedValue(new Error("db down"));
		const event = GameOverDomainEventMother.create({
			reservationId: ID,
			players: players(["winner"], ["loser"], 1, 0),
		});

		await expect(makeRecorder(repository).handle(event)).resolves.toBeUndefined();
		expect(repository.recordResult).toHaveBeenCalledTimes(3);
	});
});
