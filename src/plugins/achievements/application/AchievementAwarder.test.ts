import { mock, MockProxy } from "jest-mock-extended";
import { Logger } from "@shared/logger/domain/Logger";
import { RankGroupResolver } from "@shared/rank/application/RankGroupResolver";
import { Team } from "@shared/room/Team";
import { UserProfile } from "@shared/user-profile/domain/UserProfile";
import { UserProfileRepository } from "@shared/user-profile/domain/UserProfileRepository";
import { GameOverDomainEventMother } from "@test-support/mothers/player/GameOverDomainEventMother";
import { PlayerMother } from "@test-support/mothers/player/PlayerMother";
import { UserProfileMother } from "@test-support/mothers/user-profile/UserProfileMother";

import { config } from "../../../config/index";
import { AchievementCatalog } from "../domain/AchievementCatalog";
import { MatchHistoryReader, MatchHistorySummary } from "../domain/MatchHistoryReader";
import { UserAchievementRepository } from "../domain/UserAchievementRepository";
import { AchievementAwarder } from "./AchievementAwarder";

const CATALOG_IDS: Record<string, number> = {
	first_win: 1001,
	wins_10: 1002,
	streak_3: 1005,
	matches_100: 1008,
	"format_first_win:TCG": 1011,
	"format_first_win:Edison": 1013,
};

const summary = (overrides: Partial<MatchHistorySummary> = {}): MatchHistorySummary => ({
	rankedWins: 5,
	rankedMatches: 20,
	currentStreak: 0,
	ladderWins: { TCG: 2 },
	...overrides,
});

describe("AchievementAwarder", () => {
	let logger: MockProxy<Logger>;
	let userProfileRepository: MockProxy<UserProfileRepository>;
	let matchHistoryReader: MockProxy<MatchHistoryReader>;
	let catalog: MockProxy<AchievementCatalog>;
	let userAchievementRepository: MockProxy<UserAchievementRepository>;
	let rankGroupResolver: MockProxy<RankGroupResolver>;
	let awarder: AchievementAwarder;
	let winnerProfile: UserProfile;
	let loserProfile: UserProfile;

	const event = (overrides = {}) =>
		GameOverDomainEventMother.create({
			ranked: true,
			banListName: "TCG",
			players: [
				PlayerMother.create({
					name: winnerProfile.username,
					team: Team.PLAYER,
					winner: true,
				}).toPresentation(),
				PlayerMother.create({
					name: loserProfile.username,
					team: Team.OPPONENT,
					winner: false,
				}).toPresentation(),
			],
			...overrides,
		});

	const awardedCodesFor = (userId: string): number[] =>
		userAchievementRepository.award.mock.calls
			.filter(([award]) => award.userId === userId)
			.map(([award]) => award.achievementId);

	beforeEach(() => {
		logger = mock<Logger>();
		logger.child.mockReturnValue(logger);
		userProfileRepository = mock();
		matchHistoryReader = mock();
		catalog = mock();
		userAchievementRepository = mock();
		rankGroupResolver = mock();
		rankGroupResolver.resolveAlias.mockImplementation((name) => name);
		rankGroupResolver.groupsFor.mockReturnValue([]);
		winnerProfile = UserProfileMother.create();
		loserProfile = UserProfileMother.create();
		userProfileRepository.findByUsername.mockImplementation(async (username) =>
			username === winnerProfile.username
				? winnerProfile
				: username === loserProfile.username
					? loserProfile
					: null,
		);
		matchHistoryReader.summaryFor.mockResolvedValue(summary());
		catalog.findByCodes.mockImplementation(async (codes) =>
			codes.filter((code) => code in CATALOG_IDS).map((code) => ({ id: CATALOG_IDS[code], code })),
		);
		userAchievementRepository.award.mockResolvedValue();
		userAchievementRepository.heldAchievementIds.mockResolvedValue(new Set());

		awarder = new AchievementAwarder(
			logger,
			userProfileRepository,
			matchHistoryReader,
			catalog,
			userAchievementRepository,
			rankGroupResolver,
		);
	});

	it("does nothing for an unranked match", async () => {
		await awarder.handle(event({ ranked: false }));

		expect(userProfileRepository.findByUsername).not.toHaveBeenCalled();
		expect(userAchievementRepository.award).not.toHaveBeenCalled();
	});

	it("skips players without a profile", async () => {
		userProfileRepository.findByUsername.mockResolvedValue(null);

		await awarder.handle(event());

		expect(matchHistoryReader.summaryFor).not.toHaveBeenCalled();
		expect(userAchievementRepository.award).not.toHaveBeenCalled();
	});

	it("reads the history excluding the current match", async () => {
		const gameOver = event();

		await awarder.handle(gameOver);

		expect(matchHistoryReader.summaryFor).toHaveBeenCalledWith(winnerProfile.id, {
			excludeMatchId: gameOver.data.matchId,
		});
	});

	it("awards first_win and the ladder row with its label on the first win", async () => {
		matchHistoryReader.summaryFor.mockResolvedValue(
			summary({ rankedWins: 0, rankedMatches: 0, ladderWins: {} }),
		);

		await awarder.handle(event());

		expect(userAchievementRepository.award).toHaveBeenCalledWith({
			userId: winnerProfile.id,
			achievementId: 1001,
			season: config.season,
			labels: [],
		});
		expect(userAchievementRepository.award).toHaveBeenCalledWith({
			userId: winnerProfile.id,
			achievementId: 1011,
			season: config.season,
			labels: ["TCG"],
		});
		expect(awardedCodesFor(loserProfile.id)).toEqual([]);
	});

	it("awards wins and streak thresholds reached by the win", async () => {
		matchHistoryReader.summaryFor.mockResolvedValue(summary({ rankedWins: 9, currentStreak: 2 }));

		await awarder.handle(event());

		expect(awardedCodesFor(winnerProfile.id).sort()).toEqual([1002, 1005]);
	});

	it("awards matches_100 to the loser of the hundredth match", async () => {
		matchHistoryReader.summaryFor.mockResolvedValue(summary({ rankedMatches: 99 }));

		await awarder.handle(event());

		expect(awardedCodesFor(loserProfile.id)).toEqual([1008]);
	});

	it("folds history by ladder through the alias and group resolvers", async () => {
		rankGroupResolver.groupsFor.mockImplementation((name) =>
			name === "2010.03 Edison" ? ["Edison"] : [],
		);
		matchHistoryReader.summaryFor.mockResolvedValue(
			summary({ ladderWins: { "2009.04 Edison": 0, "2010.03 Edison": 0 } }),
		);

		await awarder.handle(event({ banListName: "2010.03 Edison" }));

		expect(userAchievementRepository.award).toHaveBeenCalledWith(
			expect.objectContaining({ achievementId: 1013, labels: ["Edison"] }),
		);
	});

	it("skips the ladder row when the ban list is N/A", async () => {
		matchHistoryReader.summaryFor.mockResolvedValue(summary({ rankedWins: 0, ladderWins: {} }));

		await awarder.handle(event({ banListName: "N/A" }));

		expect(awardedCodesFor(winnerProfile.id)).toEqual([1001]);
	});

	it("logs each award it writes", async () => {
		matchHistoryReader.summaryFor.mockResolvedValue(summary({ currentStreak: 2 }));

		await awarder.handle(event());

		expect(logger.info).toHaveBeenCalledWith(expect.stringContaining("streak_3 awarded"));
	});

	it("does not award an achievement the player already holds from another season", async () => {
		matchHistoryReader.summaryFor.mockResolvedValue(summary({ currentStreak: 2 }));
		userAchievementRepository.heldAchievementIds.mockResolvedValue(new Set([1005]));

		await awarder.handle(event());

		expect(userAchievementRepository.heldAchievementIds).toHaveBeenCalledWith(
			winnerProfile.id,
			[1005],
		);
		expect(awardedCodesFor(winnerProfile.id)).toEqual([]);
	});

	it("awards the streak to a player with no prior rows", async () => {
		matchHistoryReader.summaryFor.mockResolvedValue(summary({ currentStreak: 2 }));

		await awarder.handle(event());

		expect(awardedCodesFor(winnerProfile.id)).toEqual([1005]);
	});

	it("keeps awarding the other player when one fails", async () => {
		matchHistoryReader.summaryFor.mockImplementation(async (userId) => {
			if (userId === winnerProfile.id) {
				throw new Error("db down");
			}

			return summary({ rankedMatches: 99 });
		});

		await expect(awarder.handle(event())).resolves.toBeUndefined();

		expect(logger.error).toHaveBeenCalled();
		expect(awardedCodesFor(loserProfile.id)).toEqual([1008]);
	});

	it("does not throw when an award write fails", async () => {
		matchHistoryReader.summaryFor.mockResolvedValue(summary({ rankedMatches: 99 }));
		userAchievementRepository.award.mockRejectedValue(new Error("boom"));

		await expect(awarder.handle(event())).resolves.toBeUndefined();

		expect(logger.error).toHaveBeenCalled();
	});
});
