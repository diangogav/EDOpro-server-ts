import { mock, MockProxy } from "jest-mock-extended";
import { Logger } from "@shared/logger/domain/Logger";
import { MatchContext } from "@shared/room/domain/lifecycle/MatchLifecycleHook";
import { RankGroupResolver } from "@shared/rank/application/RankGroupResolver";
import { YGOProStocChat } from "ygopro-msg-encode";
import { Team } from "@shared/room/Team";
import { UserProfile } from "@shared/user-profile/domain/UserProfile";
import { UserProfileMother } from "@test-support/mothers/user-profile/UserProfileMother";

import { AchievementCatalog } from "../domain/AchievementCatalog";
import { AchievementUnlockedDomainEvent } from "../domain/AchievementUnlockedDomainEvent";
import { AchievementUnlockedPublisher } from "../domain/AchievementUnlockedPublisher";
import { AchievementUnlockedClientMessage } from "../infrastructure/AchievementUnlockedClientMessage";
import { MatchHistoryReader, MatchHistorySummary } from "../domain/MatchHistoryReader";
import {
	UserAchievementRepository,
	UserAchievementTransaction,
} from "../domain/UserAchievementRepository";
import { AchievementAwarder } from "./AchievementAwarder";

const SEASON = 99;

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
	let announce: jest.Mock;
	let notify: jest.Mock;
	let matchHistoryReader: MockProxy<MatchHistoryReader>;
	let catalog: MockProxy<AchievementCatalog>;
	let userAchievementRepository: MockProxy<UserAchievementTransaction>;
	let achievementRepository: MockProxy<UserAchievementRepository>;
	let rankGroupResolver: MockProxy<RankGroupResolver>;
	let publisher: MockProxy<AchievementUnlockedPublisher>;
	let awarder: AchievementAwarder;
	let winnerProfile: UserProfile;
	let loserProfile: UserProfile;

	const event = (overrides: Partial<MatchContext> = {}): MatchContext => ({
		roomId: 12,
		matchId: "match-1",
		ranked: true,
		banListName: "TCG",
		season: SEASON,
		players: [
			{ id: winnerProfile.id, team: Team.PLAYER, name: winnerProfile.username, winner: true },
			{ id: loserProfile.id, team: Team.OPPONENT, name: loserProfile.username, winner: false },
		],
		announce,
		notify,
		...overrides,
	});

	const awardedCodesFor = (userId: string): number[] =>
		userAchievementRepository.award.mock.calls
			.filter(([award]) => award.userId === userId)
			.map(([award]) => award.achievementId);

	beforeEach(() => {
		logger = mock<Logger>();
		logger.child.mockReturnValue(logger);
		announce = jest.fn();
		notify = jest.fn();
		matchHistoryReader = mock();
		catalog = mock();
		userAchievementRepository = mock();
		achievementRepository = mock();
		achievementRepository.transaction.mockImplementation((_userId, work) =>
			work(userAchievementRepository),
		);
		rankGroupResolver = mock();
		publisher = mock();
		publisher.publish.mockResolvedValue();
		rankGroupResolver.resolveAlias.mockImplementation((name) => name);
		rankGroupResolver.groupsFor.mockReturnValue([]);
		winnerProfile = UserProfileMother.create();
		loserProfile = UserProfileMother.create();
		matchHistoryReader.summaryFor.mockResolvedValue(summary());
		catalog.findByCodes.mockImplementation(async (codes) =>
			codes
				.filter((code) => code in CATALOG_IDS)
				.map((code) => ({ id: CATALOG_IDS[code], code, name: `Name of ${code}` })),
		);
		userAchievementRepository.award.mockResolvedValue();
		userAchievementRepository.heldAchievementIds.mockResolvedValue(new Set());

		awarder = new AchievementAwarder(
			logger,
			matchHistoryReader,
			catalog,
			achievementRepository,
			rankGroupResolver,
			publisher,
		);
	});

	it("does nothing for an unranked match", async () => {
		await awarder.onMatchEnding(event({ ranked: false }));

		expect(matchHistoryReader.summaryFor).not.toHaveBeenCalled();
		expect(announce).not.toHaveBeenCalled();
		expect(userAchievementRepository.award).not.toHaveBeenCalled();
	});

	it("skips players without a user id", async () => {
		const ctx = event();
		await awarder.onMatchEnding({
			...ctx,
			players: [{ ...ctx.players[0], id: null }, ctx.players[1]],
		});

		expect(matchHistoryReader.summaryFor).toHaveBeenCalledTimes(1);
		expect(matchHistoryReader.summaryFor).toHaveBeenCalledWith(loserProfile.id, expect.anything());
	});

	it("is a lifecycle hook named achievements", () => {
		expect(awarder.name).toBe("achievements");
	});

	it("reads the history excluding the current match", async () => {
		const gameOver = event();

		await awarder.onMatchEnding(gameOver);

		expect(matchHistoryReader.summaryFor).toHaveBeenCalledWith(winnerProfile.id, {
			excludeMatchId: gameOver.matchId,
		});
	});

	it("awards first_win and the ladder row with its label on the first win", async () => {
		matchHistoryReader.summaryFor.mockResolvedValue(
			summary({ rankedWins: 0, rankedMatches: 0, ladderWins: {} }),
		);

		await awarder.onMatchEnding(event());

		expect(userAchievementRepository.award).toHaveBeenCalledWith({
			userId: winnerProfile.id,
			achievementId: 1001,
			season: SEASON,
			labels: [],
		});
		expect(userAchievementRepository.award).toHaveBeenCalledWith({
			userId: winnerProfile.id,
			achievementId: 1011,
			season: SEASON,
			labels: ["TCG"],
		});
		expect(awardedCodesFor(loserProfile.id)).toEqual([]);
	});

	it("awards wins and streak thresholds reached by the win", async () => {
		matchHistoryReader.summaryFor.mockResolvedValue(summary({ rankedWins: 9, currentStreak: 2 }));

		await awarder.onMatchEnding(event());

		expect(awardedCodesFor(winnerProfile.id).sort()).toEqual([1001, 1002, 1005, 1011]);
	});

	it("awards matches_100 to the loser of the hundredth match", async () => {
		matchHistoryReader.summaryFor.mockResolvedValue(summary({ rankedMatches: 99 }));

		await awarder.onMatchEnding(event());

		expect(awardedCodesFor(loserProfile.id)).toContain(1008);
	});

	it("folds history by ladder through the alias and group resolvers", async () => {
		rankGroupResolver.groupsFor.mockImplementation((name) =>
			name === "2010.03 Edison" ? ["Edison"] : [],
		);
		matchHistoryReader.summaryFor.mockResolvedValue(
			summary({ ladderWins: { "2009.04 Edison": 0, "2010.03 Edison": 0 } }),
		);

		await awarder.onMatchEnding(event({ banListName: "2010.03 Edison" }));

		expect(userAchievementRepository.award).toHaveBeenCalledWith(
			expect.objectContaining({ achievementId: 1013, labels: ["Edison"] }),
		);
	});

	it("skips the ladder row when the ban list is N/A", async () => {
		matchHistoryReader.summaryFor.mockResolvedValue(summary({ rankedWins: 0, ladderWins: {} }));

		await awarder.onMatchEnding(event({ banListName: "N/A" }));

		expect(awardedCodesFor(winnerProfile.id)).toEqual([1001]);
	});

	it("logs each award it writes", async () => {
		matchHistoryReader.summaryFor.mockResolvedValue(summary({ currentStreak: 2 }));

		await awarder.onMatchEnding(event());

		expect(logger.info).toHaveBeenCalledWith(expect.stringContaining("streak_3 awarded"));
	});

	it("does not award an achievement the player already holds from another season", async () => {
		matchHistoryReader.summaryFor.mockResolvedValue(summary({ currentStreak: 2 }));
		userAchievementRepository.heldAchievementIds.mockResolvedValue(new Set([1005]));

		await awarder.onMatchEnding(event());

		expect(userAchievementRepository.heldAchievementIds).toHaveBeenCalledWith(
			winnerProfile.id,
			[1001, 1005, 1011],
		);
		expect(awardedCodesFor(winnerProfile.id)).not.toContain(1005);
	});

	it("checks the held achievements before inserting, inside the player's transaction", async () => {
		matchHistoryReader.summaryFor.mockResolvedValue(summary({ currentStreak: 2 }));
		const order: string[] = [];
		achievementRepository.transaction.mockImplementation(async (userId, work) => {
			order.push(`begin:${userId}`);
			const result = await work(userAchievementRepository);
			order.push("end");

			return result;
		});
		userAchievementRepository.heldAchievementIds.mockImplementation(async () => {
			order.push("held");

			return new Set();
		});
		userAchievementRepository.award.mockImplementation(async () => {
			order.push("award");
		});

		await awarder.onMatchEnding(event());

		expect(order).toEqual(
			expect.arrayContaining([`begin:${winnerProfile.id}`, "held", "award", "end"]),
		);
		expect(order.slice(0, 2)).toEqual([`begin:${winnerProfile.id}`, "held"]);
		expect(order.at(-1)).toBe("end");
	});

	it("awards the streak to a player with no prior rows", async () => {
		matchHistoryReader.summaryFor.mockResolvedValue(summary({ currentStreak: 2 }));

		await awarder.onMatchEnding(event());

		expect(awardedCodesFor(winnerProfile.id)).toContain(1005);
	});

	it("keeps awarding the other player when one fails", async () => {
		matchHistoryReader.summaryFor.mockImplementation(async (userId) => {
			if (userId === winnerProfile.id) {
				throw new Error("db down");
			}

			return summary({ rankedMatches: 99 });
		});

		await expect(awarder.onMatchEnding(event())).resolves.toBeUndefined();

		expect(logger.error).toHaveBeenCalled();
		expect(awardedCodesFor(loserProfile.id)).toContain(1008);
	});

	it("does not throw when an award write fails", async () => {
		matchHistoryReader.summaryFor.mockResolvedValue(summary({ rankedMatches: 99 }));
		userAchievementRepository.award.mockRejectedValue(new Error("boom"));

		await expect(awarder.onMatchEnding(event())).resolves.toBeUndefined();

		expect(logger.error).toHaveBeenCalled();
	});

	describe("unlock events", () => {
		const published = () => publisher.publish.mock.calls.map(([, unlocked]) => unlocked.data);

		it("publishes one event per inserted row with the exact payload", async () => {
			matchHistoryReader.summaryFor.mockResolvedValue(
				summary({ rankedWins: 0, rankedMatches: 0, ladderWins: {} }),
			);
			const gameOver = event();

			await awarder.onMatchEnding(gameOver);

			expect(publisher.publish).toHaveBeenCalledTimes(2);
			expect(publisher.publish).toHaveBeenCalledWith(
				AchievementUnlockedDomainEvent.DOMAIN_EVENT,
				expect.any(AchievementUnlockedDomainEvent),
			);
			expect(published()).toEqual(
				expect.arrayContaining([
					{
						userId: winnerProfile.id,
						username: winnerProfile.username,
						achievementId: 1001,
						code: "first_win",
						season: SEASON,
						labels: [],
						matchId: gameOver.matchId,
						roomId: gameOver.roomId,
					},
					{
						userId: winnerProfile.id,
						username: winnerProfile.username,
						achievementId: 1011,
						code: "format_first_win:TCG",
						season: SEASON,
						labels: ["TCG"],
						matchId: gameOver.matchId,
						roomId: gameOver.roomId,
					},
				]),
			);
		});

		it("publishes nothing for achievements already held", async () => {
			matchHistoryReader.summaryFor.mockResolvedValue(summary({ currentStreak: 2 }));
			userAchievementRepository.heldAchievementIds.mockResolvedValue(new Set([1001, 1005, 1011]));

			await awarder.onMatchEnding(event());

			expect(publisher.publish).not.toHaveBeenCalled();
		});

		it("publishes only the rows actually inserted", async () => {
			matchHistoryReader.summaryFor.mockResolvedValue(summary({ currentStreak: 2 }));
			userAchievementRepository.heldAchievementIds.mockResolvedValue(new Set([1001, 1011]));

			await awarder.onMatchEnding(event());

			expect(published().map((data) => data.achievementId)).toEqual([1005]);
		});

		it("publishes nothing when the transaction fails", async () => {
			userAchievementRepository.award.mockRejectedValue(new Error("boom"));

			await awarder.onMatchEnding(event());

			expect(publisher.publish).not.toHaveBeenCalled();
		});

		it("publishes only after the transaction has resolved", async () => {
			const order: string[] = [];
			achievementRepository.transaction.mockImplementation(async (_userId, work) => {
				const result = await work(userAchievementRepository);
				order.push("committed");

				return result;
			});
			publisher.publish.mockImplementation(async () => {
				order.push("published");
			});

			await awarder.onMatchEnding(event());

			expect(order[0]).toBe("committed");
			expect(order).toContain("published");
		});

		it("keeps awarding the other player when publishing throws", async () => {
			matchHistoryReader.summaryFor.mockResolvedValue(summary({ rankedMatches: 99 }));
			publisher.publish.mockRejectedValue(new Error("bus down"));

			await expect(awarder.onMatchEnding(event())).resolves.toBeUndefined();

			expect(awardedCodesFor(winnerProfile.id)).toContain(1008);
			expect(awardedCodesFor(loserProfile.id)).toContain(1008);
			expect(logger.error).toHaveBeenCalled();
		});
	});

	describe("unlock frame", () => {
		it("notifies only the unlocking player with one frame per inserted row", async () => {
			matchHistoryReader.summaryFor.mockResolvedValue(
				summary({ rankedWins: 0, rankedMatches: 0, ladderWins: {} }),
			);

			await awarder.onMatchEnding(event());

			expect(notify).toHaveBeenCalledTimes(2);
			expect(notify).toHaveBeenCalledWith(
				winnerProfile.id,
				AchievementUnlockedClientMessage.create(1001, "first_win"),
			);
			expect(notify).toHaveBeenCalledWith(
				winnerProfile.id,
				AchievementUnlockedClientMessage.create(1011, "format_first_win:TCG"),
			);
			expect(notify).not.toHaveBeenCalledWith(loserProfile.id, expect.anything());
		});

		it("does not notify rows the player already holds", async () => {
			matchHistoryReader.summaryFor.mockResolvedValue(summary({ currentStreak: 2 }));
			userAchievementRepository.heldAchievementIds.mockResolvedValue(new Set([1001, 1011]));

			await awarder.onMatchEnding(event());

			expect(notify).toHaveBeenCalledTimes(1);
			expect(notify).toHaveBeenCalledWith(
				winnerProfile.id,
				AchievementUnlockedClientMessage.create(1005, "streak_3"),
			);
		});

		it("keeps the announcement, the event and the other player when notify throws", async () => {
			matchHistoryReader.summaryFor.mockResolvedValue(summary({ rankedMatches: 99 }));
			notify.mockImplementation(() => {
				throw new Error("socket closed");
			});

			await expect(awarder.onMatchEnding(event())).resolves.toBeUndefined();

			expect(notify).toHaveBeenCalled();
			expect(announce).toHaveBeenCalledTimes(notify.mock.calls.length);
			expect(publisher.publish).toHaveBeenCalledTimes(notify.mock.calls.length);
			expect(awardedCodesFor(loserProfile.id)).toContain(1008);
			expect(logger.warn).toHaveBeenCalled();
		});
	});

	describe("announcements", () => {
		it("announces once per inserted row with the catalog name", async () => {
			matchHistoryReader.summaryFor.mockResolvedValue(
				summary({ rankedWins: 0, rankedMatches: 0, ladderWins: {} }),
			);

			await awarder.onMatchEnding(event());

			expect(announce).toHaveBeenCalledTimes(2);
			expect(announce).toHaveBeenCalledWith(
				`🏆 ${winnerProfile.username} unlocked "Name of first_win"`,
			);
			expect(announce).toHaveBeenCalledWith(
				`🏆 ${winnerProfile.username} unlocked "Name of format_first_win:TCG"`,
			);
		});

		it("does not announce rows the player already holds", async () => {
			matchHistoryReader.summaryFor.mockResolvedValue(summary({ currentStreak: 2 }));
			userAchievementRepository.heldAchievementIds.mockResolvedValue(new Set([1001, 1011]));

			await awarder.onMatchEnding(event());

			expect(announce).toHaveBeenCalledTimes(1);
			expect(announce).toHaveBeenCalledWith(
				`🏆 ${winnerProfile.username} unlocked "Name of streak_3"`,
			);
		});

		it("announces after the transaction commits", async () => {
			const order: string[] = [];
			achievementRepository.transaction.mockImplementation(async (_userId, work) => {
				const result = await work(userAchievementRepository);
				order.push("committed");

				return result;
			});
			announce.mockImplementation(() => order.push("announced"));

			await awarder.onMatchEnding(event());

			expect(order[0]).toBe("committed");
			expect(order).toContain("announced");
		});

		it("keeps the event publish and the other player when announce throws", async () => {
			matchHistoryReader.summaryFor.mockResolvedValue(summary({ rankedMatches: 99 }));
			announce.mockImplementation(() => {
				throw new Error("socket closed");
			});

			await expect(awarder.onMatchEnding(event())).resolves.toBeUndefined();

			expect(announce).toHaveBeenCalled();
			expect(publisher.publish).toHaveBeenCalledTimes(announce.mock.calls.length);
			expect(awardedCodesFor(loserProfile.id)).toContain(1008);
			expect(logger.warn).toHaveBeenCalled();
		});

		it("keeps every announcement under the system chat limit", async () => {
			catalog.findByCodes.mockResolvedValue([
				{ id: 1001, code: "first_win", name: "x".repeat(500) },
			]);

			await awarder.onMatchEnding(event());

			const [message] = announce.mock.calls[0];
			expect(message.length).toBeLessThanOrEqual(YGOProStocChat.MAX_LENGTH);
		});
	});
});
