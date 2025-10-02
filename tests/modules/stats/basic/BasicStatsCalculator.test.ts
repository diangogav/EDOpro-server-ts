/* eslint-disable @typescript-eslint/unbound-method */
import { faker } from "@faker-js/faker";
import { mock, MockProxy } from "jest-mock-extended";
import { Logger } from "src/shared/logger/domain/Logger";
import { Player } from "src/shared/player/domain/Player";
import { Team } from "src/shared/room/Team";
import { BasicStatsCalculator } from "src/shared/stats/basic/application/BasicStatsCalculator";
import { MatchResumeCreator } from "src/shared/stats/match-resume/application/MatchResumeCreator";
import { DuelResumeCreator } from "src/shared/stats/match-resume/duel-resume/application/DuelResumeCreator";
import { PlayerStats } from "src/shared/stats/player-stats/domain/PlayerStats";
import { PlayerStatsRepository } from "src/shared/stats/player-stats/domain/PlayerStatsRepository";
import { UserProfile } from "src/shared/user-profile/domain/UserProfile";
import { UserProfileRepository } from "src/shared/user-profile/domain/UserProfileRepository";
import { GameMother } from "tests/modules/shared/mothers/player/GameMother";
import { GameOverDomainEventMother } from "tests/modules/shared/mothers/player/GameOverDomainEventMother";
import { PlayerMother } from "tests/modules/shared/mothers/player/PlayerMother";
import { PlayerStatsMother } from "tests/modules/shared/mothers/player/PlayerStatsMother";
import { UserProfileMother } from "tests/modules/shared/mothers/user-profile/UserProfileMother";

describe("BasicStatsCalculator", () => {
	let basicStatsCalculator: BasicStatsCalculator;

	let player: Player;
	let opponent: Player;
	let logger: MockProxy<Logger>;
	let userProfileRepository: MockProxy<UserProfileRepository>;
	let playerStatsRepository: MockProxy<PlayerStatsRepository>;
	let matchResumeCreator: MockProxy<MatchResumeCreator>;
	let duelResumeCreator: MockProxy<DuelResumeCreator>;
	let playerUserProfile: UserProfile;
	let opponentUserProfile: UserProfile;
	let playerStats: PlayerStats;
	let opponentStats: PlayerStats;
	let matchId: string;

	beforeEach(() => {
		logger = mock<Logger>();
		logger.child.mockReturnValue(logger);
		userProfileRepository = mock();
		playerStatsRepository = mock<PlayerStatsRepository>();
		matchResumeCreator = mock();
		duelResumeCreator = mock();
		playerUserProfile = UserProfileMother.create();
		opponentUserProfile = UserProfileMother.create();
		playerStats = PlayerStatsMother.create();
		opponentStats = PlayerStatsMother.create();
		matchId = faker.string.uuid();
	});

	beforeEach(() => {
		basicStatsCalculator = new BasicStatsCalculator(
			logger,
			userProfileRepository,
			playerStatsRepository,
			matchResumeCreator,
			duelResumeCreator
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

		playerStatsRepository.findByUserIdAndBanListName
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
		});

		await basicStatsCalculator.handle(event);

		expect(playerStatsRepository.findByUserIdAndBanListName).toHaveBeenCalledTimes(2);
		expect(playerStatsRepository.save).toHaveBeenCalledTimes(2);

		expect(playerStatsRepository.findByUserIdAndBanListName).toHaveBeenNthCalledWith(
			1,
			playerUserProfile.id,
			"Global"
		);
		expect(playerStatsRepository.findByUserIdAndBanListName).toHaveBeenNthCalledWith(
			2,
			opponentUserProfile.id,
			"Global"
		);
		expect(playerStatsRepository.save).toHaveBeenNthCalledWith(1, PlayerStats.from(playerStats));
		expect(playerStatsRepository.save).toHaveBeenNthCalledWith(2, PlayerStats.from(opponentStats));
	});
});
