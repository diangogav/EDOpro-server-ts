import { faker } from "@faker-js/faker";
import { mock, MockProxy } from "jest-mock-extended";
import { Logger } from "@shared/logger/domain/Logger";
import { Player } from "@shared/player/domain/Player";
import { Team } from "@shared/room/Team";
import { MatchResumeCreator } from "@shared/stats/match-resume/application/MatchResumeCreator";
import { DuelResumeCreator } from "@shared/stats/match-resume/duel-resume/application/DuelResumeCreator";
import { PlayerStats } from "@shared/stats/player-stats/domain/PlayerStats";
import { PlayerStatsRepository } from "@shared/stats/player-stats/domain/PlayerStatsRepository";
import { Rank } from "@shared/rank/domain/Rank";
import { RankRepository } from "@shared/rank/domain/RankRepository";
import { UserProfile } from "@shared/user-profile/domain/UserProfile";
import { UserProfileRepository } from "@shared/user-profile/domain/UserProfileRepository";
import { GameMother } from "@test-support/mothers/player/GameMother";
import { GameOverDomainEventMother } from "@test-support/mothers/player/GameOverDomainEventMother";
import { PlayerMother } from "@test-support/mothers/player/PlayerMother";
import { PlayerStatsMother } from "@test-support/mothers/player/PlayerStatsMother";
import { RankMother } from "@test-support/mothers/rank/RankMother";
import { UserProfileMother } from "@test-support/mothers/user-profile/UserProfileMother";

import { BasicStatsCalculator } from "./BasicStatsCalculator";

describe("BasicStatsCalculator", () => {
	let basicStatsCalculator: BasicStatsCalculator;

	let player: Player;
	let opponent: Player;
	let logger: MockProxy<Logger>;
	let userProfileRepository: MockProxy<UserProfileRepository>;
	let playerStatsRepository: MockProxy<PlayerStatsRepository>;
	let rankRepository: MockProxy<RankRepository>;
	let matchResumeCreator: MockProxy<MatchResumeCreator>;
	let duelResumeCreator: MockProxy<DuelResumeCreator>;
	let playerUserProfile: UserProfile;
	let opponentUserProfile: UserProfile;
	let playerStats: PlayerStats;
	let opponentStats: PlayerStats;
	let matchId: string;
	let globalRank: Rank;
	let formatRank: Rank;

	beforeEach(() => {
		logger = mock<Logger>();
		logger.child.mockReturnValue(logger);
		userProfileRepository = mock();
		playerStatsRepository = mock<PlayerStatsRepository>();
		rankRepository = mock<RankRepository>();
		matchResumeCreator = mock();
		duelResumeCreator = mock();
		playerUserProfile = UserProfileMother.create();
		opponentUserProfile = UserProfileMother.create();
		playerStats = PlayerStatsMother.create();
		opponentStats = PlayerStatsMother.create();
		matchId = faker.string.uuid();
		globalRank = RankMother.create({ name: "Global", type: "global" });
		formatRank = RankMother.create();
		rankRepository.findOrCreateByName.mockImplementation(async (name) =>
			name === "Global" ? globalRank : { ...formatRank, name },
		);
	});

	beforeEach(() => {
		basicStatsCalculator = new BasicStatsCalculator(
			logger,
			userProfileRepository,
			playerStatsRepository,
			rankRepository,
			matchResumeCreator,
			duelResumeCreator,
		);
		player = PlayerMother.create({
			team: Team.PLAYER,
			winner: true,
			games: [
				GameMother.create({ result: "winner" }),
				GameMother.create({ result: "winner" }),
				GameMother.create({ result: "winner" }),
			],
		});
		opponent = PlayerMother.create({
			team: Team.OPPONENT,
			winner: false,
			games: [
				GameMother.create({ result: "loser" }),
				GameMother.create({ result: "loser" }),
				GameMother.create({ result: "loser" }),
			],
		});

		userProfileRepository.findByUsername
			.mockResolvedValueOnce(playerUserProfile)
			.mockResolvedValueOnce(opponentUserProfile);

		playerStatsRepository.findByUserIdAndRankId
			.mockResolvedValueOnce(playerStats)
			.mockResolvedValueOnce(opponentStats);

		matchResumeCreator.run.mockResolvedValue({ id: matchId });
	});

	afterEach(() => {
		jest.clearAllMocks();
	});

	it("Should calculate players points correctly", async () => {
		player = PlayerMother.create({
			...player.toPresentation(),
			games: [
				GameMother.create({ result: "winner" }),
				GameMother.create({ result: "loser" }),
				GameMother.create({ result: "winner" }),
				GameMother.create({ result: "loser" }),
				GameMother.create({ result: "winner" }),
			],
		});
		opponent = PlayerMother.create({
			...opponent.toPresentation(),
			games: [
				GameMother.create({ result: "loser" }),
				GameMother.create({ result: "winner" }),
				GameMother.create({ result: "loser" }),
				GameMother.create({ result: "winner" }),
				GameMother.create({ result: "loser" }),
			],
		});
		const players = [player, opponent];
		const event = GameOverDomainEventMother.create({
			players: players.map((player) => player.toPresentation()),
			ranked: true,
			banListName: "N/A",
		});

		await basicStatsCalculator.handle(event);

		expect(playerStatsRepository.findByUserIdAndRankId).toHaveBeenCalledTimes(2);
		expect(playerStatsRepository.save).toHaveBeenCalledTimes(2);

		expect(playerStatsRepository.findByUserIdAndRankId).toHaveBeenNthCalledWith(
			1,
			playerUserProfile.id,
			globalRank.id,
		);
		expect(playerStatsRepository.findByUserIdAndRankId).toHaveBeenNthCalledWith(
			2,
			opponentUserProfile.id,
			globalRank.id,
		);
		expect(playerStatsRepository.save).toHaveBeenNthCalledWith(1, PlayerStats.from(playerStats));
		expect(playerStatsRepository.save).toHaveBeenNthCalledWith(2, PlayerStats.from(opponentStats));
	});

	it("uses the event's matchId as the persisted gameId instead of inventing one", async () => {
		const event = GameOverDomainEventMother.create({
			players: [player.toPresentation(), opponent.toPresentation()],
			ranked: true,
			banListName: "N/A",
			matchId: "match-uuid-1",
		});

		await basicStatsCalculator.handle(event);

		expect(matchResumeCreator.run).toHaveBeenCalledWith(
			expect.objectContaining({ gameId: "match-uuid-1" }),
		);
	});

	it("persists each duel resume under its real duelId when the event carries one per game", async () => {
		const event = GameOverDomainEventMother.create({
			players: [player.toPresentation(), opponent.toPresentation()],
			ranked: true,
			banListName: "N/A",
			matchId: "match-uuid-1",
			duelIds: ["duel-uuid-1", "duel-uuid-2", "duel-uuid-3"],
		});

		await basicStatsCalculator.handle(event);

		// Both players' rows of game i carry the SAME duelId — the cross-player
		// correlation key.
		const duelIdsPassed = duelResumeCreator.run.mock.calls.map(
			([payload]) => (payload as { duelId: string | null }).duelId,
		);
		expect(duelIdsPassed).toEqual([
			"duel-uuid-1",
			"duel-uuid-2",
			"duel-uuid-3",
			"duel-uuid-1",
			"duel-uuid-2",
			"duel-uuid-3",
		]);
	});

	it("falls back to null duelIds and warns when the count does not match the games", async () => {
		const event = GameOverDomainEventMother.create({
			players: [player.toPresentation(), opponent.toPresentation()],
			ranked: true,
			banListName: "N/A",
			matchId: "match-uuid-1",
			duelIds: ["duel-uuid-1"],
		});

		await basicStatsCalculator.handle(event);

		const duelIdsPassed = duelResumeCreator.run.mock.calls.map(
			([payload]) => (payload as { duelId: string | null }).duelId,
		);
		expect(duelIdsPassed).toEqual([null, null, null, null, null, null]);
		expect(logger.warn).toHaveBeenCalled();
	});

	it("Should use banListName from event data (not from hash lookup) for per-format rank", async () => {
		const edisonBanListName = "2010.03 Edison";
		playerStatsRepository.findByUserIdAndRankId
			.mockResolvedValueOnce(playerStats) // per-format lookup for player
			.mockResolvedValueOnce(playerStats) // Global lookup for player
			.mockResolvedValueOnce(opponentStats) // per-format lookup for opponent
			.mockResolvedValueOnce(opponentStats); // Global lookup for opponent

		const players = [player, opponent];
		const event = GameOverDomainEventMother.create({
			players: players.map((p) => p.toPresentation()),
			ranked: true,
			banListName: edisonBanListName,
		});

		await basicStatsCalculator.handle(event);

		// Per-format rank must be resolved from the name in event.data.banListName
		expect(rankRepository.findOrCreateByName).toHaveBeenCalledWith(edisonBanListName);
		expect(playerStatsRepository.findByUserIdAndRankId).toHaveBeenCalledWith(
			playerUserProfile.id,
			formatRank.id,
		);
		expect(playerStatsRepository.findByUserIdAndRankId).toHaveBeenCalledWith(
			opponentUserProfile.id,
			formatRank.id,
		);
	});

	it("Should NOT write per-format row when banListName is N/A", async () => {
		const players = [player, opponent];
		const event = GameOverDomainEventMother.create({
			players: players.map((p) => p.toPresentation()),
			ranked: true,
			banListName: "N/A",
		});

		await basicStatsCalculator.handle(event);

		// Only Global-rank calls — no rank resolution and no row for "N/A"
		expect(rankRepository.findOrCreateByName).not.toHaveBeenCalledWith("N/A");
		const calls = playerStatsRepository.findByUserIdAndRankId.mock.calls;
		const perFormatCalls = calls.filter(([, rankId]) => rankId !== globalRank.id);
		expect(perFormatCalls).toHaveLength(0);
	});

	it("writes one row for the banlist rank and one for the Global rank per player", async () => {
		playerStatsRepository.findByUserIdAndRankId
			.mockReset()
			.mockResolvedValueOnce(playerStats) // per-format row for player
			.mockResolvedValueOnce(playerStats) // Global row for player
			.mockResolvedValueOnce(opponentStats) // per-format row for opponent
			.mockResolvedValueOnce(opponentStats); // Global row for opponent
		const event = GameOverDomainEventMother.create({
			players: [player.toPresentation(), opponent.toPresentation()],
			ranked: true,
			banListName: "TCG",
		});

		await basicStatsCalculator.handle(event);

		expect(rankRepository.findOrCreateByName).toHaveBeenCalledWith("TCG");
		expect(rankRepository.findOrCreateByName).toHaveBeenCalledWith("Global");
		expect(playerStatsRepository.findByUserIdAndRankId).toHaveBeenNthCalledWith(
			1,
			playerUserProfile.id,
			formatRank.id,
		);
		expect(playerStatsRepository.findByUserIdAndRankId).toHaveBeenNthCalledWith(
			2,
			playerUserProfile.id,
			globalRank.id,
		);
		expect(playerStatsRepository.findByUserIdAndRankId).toHaveBeenNthCalledWith(
			3,
			opponentUserProfile.id,
			formatRank.id,
		);
		expect(playerStatsRepository.findByUserIdAndRankId).toHaveBeenNthCalledWith(
			4,
			opponentUserProfile.id,
			globalRank.id,
		);
		expect(playerStatsRepository.save).toHaveBeenCalledTimes(4);
	});
});
