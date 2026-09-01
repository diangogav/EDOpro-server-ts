import { mock, MockProxy } from "jest-mock-extended";
import { Logger } from "@shared/logger/domain/Logger";
import { RankGroupResolver } from "@shared/rank/application/RankGroupResolver";
import { Rank } from "@shared/rank/domain/Rank";
import { RankRepository } from "@shared/rank/domain/RankRepository";
import { Team } from "@shared/room/Team";
import { Rating } from "@shared/stats/rating/domain/Rating";
import {
	RatingHistoryEntry,
	RatingRepository,
	RatingTransaction,
} from "@shared/stats/rating/domain/RatingRepository";
import { UserProfileRepository } from "@shared/user-profile/domain/UserProfileRepository";
import { GameOverDomainEventMother } from "@test-support/mothers/player/GameOverDomainEventMother";
import { PlayerMother } from "@test-support/mothers/player/PlayerMother";
import { RankMother } from "@test-support/mothers/rank/RankMother";
import { RatingMother } from "@test-support/mothers/player/RatingMother";
import { UserProfileMother } from "@test-support/mothers/user-profile/UserProfileMother";

import { config } from "../../../config/index";
import { EloRatingCalculator } from "./EloRatingCalculator";

describe("EloRatingCalculator", () => {
	let calculator: EloRatingCalculator;
	let logger: MockProxy<Logger>;
	let userProfileRepository: MockProxy<UserProfileRepository>;
	let ratingRepository: MockProxy<RatingRepository>;
	let rankRepository: MockProxy<RankRepository>;
	let rankGroupResolver: MockProxy<RankGroupResolver>;
	let rank: Rank;
	let tx: MockProxy<RatingTransaction>;

	beforeEach(() => {
		logger = mock<Logger>();
		logger.child.mockReturnValue(logger);
		userProfileRepository = mock<UserProfileRepository>();
		ratingRepository = mock<RatingRepository>();
		rankRepository = mock<RankRepository>();
		rankGroupResolver = mock<RankGroupResolver>();
		rankGroupResolver.resolveAlias.mockImplementation((name) => name);
		rankGroupResolver.groupsFor.mockReturnValue([]);
		rank = RankMother.create({ name: "TCG" });
		rankRepository.findOrCreateByName.mockResolvedValue(rank);
		tx = mock<RatingTransaction>();
		tx.insertHistory.mockResolvedValue(true);

		calculator = new EloRatingCalculator(
			logger,
			userProfileRepository,
			ratingRepository,
			rankRepository,
			rankGroupResolver,
		);
	});

	function makeEligibleEvent(overrides?: Parameters<typeof GameOverDomainEventMother.create>[0]) {
		const winner = PlayerMother.create({ id: "player-1", team: Team.PLAYER, winner: true });
		const loser = PlayerMother.create({ id: "player-2", team: Team.OPPONENT, winner: false });

		return GameOverDomainEventMother.create({
			matchId: "match-1",
			ranked: true,
			banListName: "TCG",
			players: [winner.toPresentation(), loser.toPresentation()],
			...overrides,
		});
	}

	describe("S7 — eligible ranked match", () => {
		it("resolves accounts by player.id only, then writes one applied history row and updated rating per player", async () => {
			const winnerProfile = UserProfileMother.create({ id: "player-1" });
			const loserProfile = UserProfileMother.create({ id: "player-2" });
			userProfileRepository.findById.mockImplementation(async (id) =>
				id === "player-1" ? winnerProfile : loserProfile,
			);
			const ratings = new Map<string, Rating>([
				["player-1", Rating.from({ value: 1000, gamesPlayed: 20, peak: 1000 })],
				["player-2", Rating.from({ value: 1000, gamesPlayed: 20, peak: 1000 })],
			]);
			ratingRepository.transaction.mockImplementation(async (_userIds, _banList, _season, work) =>
				work(ratings, tx),
			);

			await calculator.handle(makeEligibleEvent());

			expect(userProfileRepository.findById).toHaveBeenCalledWith("player-1");
			expect(userProfileRepository.findById).toHaveBeenCalledWith("player-2");
			expect(userProfileRepository.findByUsername).not.toHaveBeenCalled();

			expect(rankRepository.findOrCreateByName).toHaveBeenCalledWith("TCG");
			expect(ratingRepository.transaction).toHaveBeenCalledWith(
				expect.arrayContaining(["player-1", "player-2"]),
				rank.id,
				config.season,
				expect.any(Function),
			);

			expect(tx.insertHistory).toHaveBeenCalledWith(
				expect.objectContaining({
					matchId: "match-1",
					userId: "player-1",
					rankId: rank.id,
					season: config.season,
					kind: "applied",
					delta: 10,
				}),
			);
			expect(tx.insertHistory).toHaveBeenCalledWith(
				expect.objectContaining({
					matchId: "match-1",
					userId: "player-2",
					kind: "applied",
					delta: -10,
				}),
			);

			expect(tx.saveRating).toHaveBeenCalledWith(
				"player-1",
				rank.id,
				config.season,
				Rating.from({ value: 1010, gamesPlayed: 21, peak: 1010 }),
			);
			expect(tx.saveRating).toHaveBeenCalledWith(
				"player-2",
				rank.id,
				config.season,
				Rating.from({ value: 990, gamesPlayed: 21, peak: 1000 }),
			);
		});
	});

	describe("S8 — unranked match excluded", () => {
		it("writes no rating row when the match is not ranked", async () => {
			await calculator.handle(makeEligibleEvent({ ranked: false }));

			expect(ratingRepository.transaction).not.toHaveBeenCalled();
			expect(rankRepository.findOrCreateByName).not.toHaveBeenCalled();
			expect(userProfileRepository.findById).not.toHaveBeenCalled();
		});
	});

	describe("S9 — bot participant excluded", () => {
		it("writes no rating row for the whole match when a participant has no account id (a bot)", async () => {
			const winner = PlayerMother.create({ id: "player-1", team: Team.PLAYER, winner: true });
			const bot = PlayerMother.create({ id: null, team: Team.OPPONENT, winner: false });
			const event = GameOverDomainEventMother.create({
				matchId: "match-1",
				ranked: true,
				banListName: "TCG",
				players: [winner.toPresentation(), bot.toPresentation()],
			});

			await calculator.handle(event);

			expect(ratingRepository.transaction).not.toHaveBeenCalled();
			expect(logger.warn).toHaveBeenCalled();
		});
	});

	describe("S10 — N/A banlist excluded", () => {
		it("writes no rating row when banListName is N/A", async () => {
			await calculator.handle(makeEligibleEvent({ banListName: "N/A" }));

			expect(ratingRepository.transaction).not.toHaveBeenCalled();
			expect(rankRepository.findOrCreateByName).not.toHaveBeenCalled();
		});
	});

	describe("S11 — missing player.id excluded and logged", () => {
		it("writes no rating row and logs the skip when a player lacks player.id", async () => {
			const winner = PlayerMother.create({ id: "player-1", team: Team.PLAYER, winner: true });
			const noId = PlayerMother.create({ id: null, team: Team.OPPONENT, winner: false });
			const event = GameOverDomainEventMother.create({
				matchId: "match-1",
				ranked: true,
				banListName: "TCG",
				players: [winner.toPresentation(), noId.toPresentation()],
			});

			await calculator.handle(event);

			expect(ratingRepository.transaction).not.toHaveBeenCalled();
			expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining("match-1"));
		});
	});

	describe("S12 — one row per player per match", () => {
		it("writes exactly one history row per player, never duplicated", async () => {
			const winnerProfile = UserProfileMother.create({ id: "player-1" });
			const loserProfile = UserProfileMother.create({ id: "player-2" });
			userProfileRepository.findById.mockImplementation(async (id) =>
				id === "player-1" ? winnerProfile : loserProfile,
			);
			const ratings = new Map<string, Rating>([
				["player-1", RatingMother.create()],
				["player-2", RatingMother.create()],
			]);
			ratingRepository.transaction.mockImplementation(async (_userIds, _banList, _season, work) =>
				work(ratings, tx),
			);

			await calculator.handle(makeEligibleEvent());

			expect(tx.insertHistory).toHaveBeenCalledTimes(2);
		});
	});

	describe("S13 — replayed GAME_OVER is a no-op", () => {
		it("does not update player_ratings when insertHistory reports the row already exists", async () => {
			const winnerProfile = UserProfileMother.create({ id: "player-1" });
			const loserProfile = UserProfileMother.create({ id: "player-2" });
			userProfileRepository.findById.mockImplementation(async (id) =>
				id === "player-1" ? winnerProfile : loserProfile,
			);
			const ratings = new Map<string, Rating>([
				["player-1", RatingMother.create()],
				["player-2", RatingMother.create()],
			]);
			tx.insertHistory.mockResolvedValue(false);
			ratingRepository.transaction.mockImplementation(async (_userIds, _banList, _season, work) =>
				work(ratings, tx),
			);

			await calculator.handle(makeEligibleEvent());

			expect(tx.insertHistory).toHaveBeenCalledTimes(2);
			expect(tx.saveRating).not.toHaveBeenCalled();
		});
	});

	describe("rating floor — history stays reconcilable with the stored rating", () => {
		it("records the delta the floor let through, so previousRating + delta is the saved rating", async () => {
			const winnerProfile = UserProfileMother.create({ id: "player-1" });
			const loserProfile = UserProfileMother.create({ id: "player-2" });
			userProfileRepository.findById.mockImplementation(async (id) =>
				id === "player-1" ? winnerProfile : loserProfile,
			);
			// Both sit 5 points above the floor, so the curve's -10 loss cannot be
			// paid in full and the floor truncates it to -5.
			const ratings = new Map<string, Rating>([
				["player-1", Rating.from({ value: 105, gamesPlayed: 20, peak: 1400 })],
				["player-2", Rating.from({ value: 105, gamesPlayed: 20, peak: 1400 })],
			]);
			ratingRepository.transaction.mockImplementation(async (_userIds, _banList, _season, work) =>
				work(ratings, tx),
			);

			await calculator.handle(makeEligibleEvent());

			expect(tx.insertHistory).toHaveBeenCalledWith(
				expect.objectContaining({ userId: "player-2", previousRating: 105, delta: -5 }),
			);
			expect(tx.saveRating).toHaveBeenCalledWith(
				"player-2",
				rank.id,
				config.season,
				Rating.from({ value: 100, gamesPlayed: 21, peak: 1400 }),
			);

			const loserEntry = tx.insertHistory.mock.calls
				.map(([entry]) => entry)
				.find((entry) => entry.userId === "player-2") as RatingHistoryEntry;
			const [, , , savedLoserRating] = tx.saveRating.mock.calls.find(
				([userId]) => userId === "player-2",
			) as [string, string, number, Rating];

			expect(loserEntry.previousRating + loserEntry.delta).toBe(savedLoserRating.value);
		});

		it("leaves an unfloored delta exactly as the curve produced it", async () => {
			const winnerProfile = UserProfileMother.create({ id: "player-1" });
			const loserProfile = UserProfileMother.create({ id: "player-2" });
			userProfileRepository.findById.mockImplementation(async (id) =>
				id === "player-1" ? winnerProfile : loserProfile,
			);
			const ratings = new Map<string, Rating>([
				["player-1", Rating.from({ value: 105, gamesPlayed: 20, peak: 1400 })],
				["player-2", Rating.from({ value: 105, gamesPlayed: 20, peak: 1400 })],
			]);
			ratingRepository.transaction.mockImplementation(async (_userIds, _banList, _season, work) =>
				work(ratings, tx),
			);

			await calculator.handle(makeEligibleEvent());

			expect(tx.insertHistory).toHaveBeenCalledWith(
				expect.objectContaining({ userId: "player-1", previousRating: 105, delta: 10 }),
			);
			expect(tx.saveRating).toHaveBeenCalledWith(
				"player-1",
				rank.id,
				config.season,
				Rating.from({ value: 115, gamesPlayed: 21, peak: 1400 }),
			);
		});
	});

	describe("G5 — eligibility log strings are pinned across the gate refactor", () => {
		it("logs the unranked skip reason verbatim", async () => {
			await calculator.handle(makeEligibleEvent({ ranked: false, matchId: "match-1" }));

			expect(logger.info).toHaveBeenCalledWith(
				expect.stringContaining("Skipping rating for match match-1: match is not ranked."),
			);
		});

		it("logs the no-ranked-banlist skip reason verbatim", async () => {
			await calculator.handle(makeEligibleEvent({ banListName: "N/A", matchId: "match-1" }));

			expect(logger.info).toHaveBeenCalledWith(
				expect.stringContaining('Skipping rating for match match-1: no ranked banlist ("N/A").'),
			);
		});

		it("logs the missing-account-id skip reason verbatim, including the count", async () => {
			const winner = PlayerMother.create({ id: "player-1", team: Team.PLAYER, winner: true });
			const noId = PlayerMother.create({ id: null, team: Team.OPPONENT, winner: false });
			const event = GameOverDomainEventMother.create({
				matchId: "match-1",
				ranked: true,
				banListName: "TCG",
				players: [winner.toPresentation(), noId.toPresentation()],
			});

			await calculator.handle(event);

			expect(logger.warn).toHaveBeenCalledWith(
				expect.stringContaining(
					"Skipping rating for match match-1: 1 participant(s) have no account id (bot or unresolved account).",
				),
			);
		});
	});

	describe("account resolution gap", () => {
		it("writes no rating row when a player's account cannot be resolved by id", async () => {
			userProfileRepository.findById.mockResolvedValue(null);

			await calculator.handle(makeEligibleEvent());

			expect(ratingRepository.transaction).not.toHaveBeenCalled();
			expect(logger.warn).toHaveBeenCalled();
		});
	});

	describe("group ranks", () => {
		function resolveAccounts(): void {
			const winnerProfile = UserProfileMother.create({ id: "player-1" });
			const loserProfile = UserProfileMother.create({ id: "player-2" });
			userProfileRepository.findById.mockImplementation(async (id) =>
				id === "player-1" ? winnerProfile : loserProfile,
			);
		}

		it("processes one independent Elo transaction per resolved group rank", async () => {
			const groupRank = RankMother.create({ name: "TCG Ladder", type: "group" });
			rankGroupResolver.groupsFor.mockReturnValue(["TCG Ladder"]);
			rankRepository.findOrCreateByName.mockImplementation(async (name) =>
				name === "TCG Ladder" ? groupRank : rank,
			);
			resolveAccounts();
			ratingRepository.transaction.mockImplementation(async (_userIds, _rankId, _season, work) =>
				work(
					new Map<string, Rating>([
						["player-1", Rating.from({ value: 1000, gamesPlayed: 20, peak: 1000 })],
						["player-2", Rating.from({ value: 1000, gamesPlayed: 20, peak: 1000 })],
					]),
					tx,
				),
			);

			await calculator.handle(makeEligibleEvent());

			expect(rankRepository.findOrCreateByName).toHaveBeenCalledWith("TCG");
			expect(rankRepository.findOrCreateByName).toHaveBeenCalledWith("TCG Ladder", "group");
			expect(ratingRepository.transaction).toHaveBeenCalledTimes(2);
			expect(ratingRepository.transaction).toHaveBeenCalledWith(
				expect.arrayContaining(["player-1", "player-2"]),
				rank.id,
				config.season,
				expect.any(Function),
			);
			expect(ratingRepository.transaction).toHaveBeenCalledWith(
				expect.arrayContaining(["player-1", "player-2"]),
				groupRank.id,
				config.season,
				expect.any(Function),
			);
			expect(tx.insertHistory).toHaveBeenCalledWith(
				expect.objectContaining({ userId: "player-1", rankId: rank.id }),
			);
			expect(tx.insertHistory).toHaveBeenCalledWith(
				expect.objectContaining({ userId: "player-1", rankId: groupRank.id }),
			);
			expect(tx.saveRating).toHaveBeenCalledWith(
				"player-1",
				groupRank.id,
				config.season,
				expect.anything(),
			);
		});

		// rating_history is UNIQUE on (match_id, user_id, kind, rank_id): one
		// match feeds several ladders and each needs its own row. This fake
		// enforces that exact key, so a narrower one would collide, report the
		// row as already recorded, and fail the assertions below.
		function uniqueHistoryStore(): {
			tx: RatingTransaction;
			historyKeys: string[];
			savedRanks: string[];
		} {
			const historyKeys: string[] = [];
			const savedRanks: string[] = [];
			const tx: RatingTransaction = {
				insertHistory: async (entry) => {
					const key = [entry.matchId, entry.userId, entry.kind, entry.rankId].join("|");
					if (historyKeys.includes(key)) {
						return false;
					}
					historyKeys.push(key);

					return true;
				},
				saveRating: async (_userId, rankId) => {
					savedRanks.push(rankId);
				},
			};

			return { tx, historyKeys, savedRanks };
		}

		it("writes history and a rating for the ban list rank and for the group rank it feeds", async () => {
			const groupRank = RankMother.create({ name: "TCG Ladder", type: "group" });
			rankGroupResolver.groupsFor.mockReturnValue(["TCG Ladder"]);
			rankRepository.findOrCreateByName.mockImplementation(async (name) =>
				name === "TCG Ladder" ? groupRank : rank,
			);
			resolveAccounts();
			const store = uniqueHistoryStore();
			ratingRepository.transaction.mockImplementation(async (_userIds, _rankId, _season, work) =>
				work(
					new Map<string, Rating>([
						["player-1", Rating.from({ value: 1000, gamesPlayed: 20, peak: 1000 })],
						["player-2", Rating.from({ value: 1000, gamesPlayed: 20, peak: 1000 })],
					]),
					store.tx,
				),
			);

			await calculator.handle(makeEligibleEvent());

			expect(store.historyKeys).toEqual([
				`match-1|player-1|applied|${rank.id}`,
				`match-1|player-2|applied|${rank.id}`,
				`match-1|player-1|applied|${groupRank.id}`,
				`match-1|player-2|applied|${groupRank.id}`,
			]);
			expect(store.savedRanks).toEqual([rank.id, rank.id, groupRank.id, groupRank.id]);
		});

		it("still treats a replay of the same match on the same ladders as a no-op", async () => {
			const groupRank = RankMother.create({ name: "TCG Ladder", type: "group" });
			rankGroupResolver.groupsFor.mockReturnValue(["TCG Ladder"]);
			rankRepository.findOrCreateByName.mockImplementation(async (name) =>
				name === "TCG Ladder" ? groupRank : rank,
			);
			resolveAccounts();
			const store = uniqueHistoryStore();
			ratingRepository.transaction.mockImplementation(async (_userIds, _rankId, _season, work) =>
				work(
					new Map<string, Rating>([
						["player-1", Rating.from({ value: 1000, gamesPlayed: 20, peak: 1000 })],
						["player-2", Rating.from({ value: 1000, gamesPlayed: 20, peak: 1000 })],
					]),
					store.tx,
				),
			);

			await calculator.handle(makeEligibleEvent());
			await calculator.handle(makeEligibleEvent());

			expect(store.historyKeys).toHaveLength(4);
			expect(store.savedRanks).toHaveLength(4);
		});

		it("resolves the alias before the rank lookup and resolves groups from the canonical name", async () => {
			rankGroupResolver.resolveAlias.mockImplementation((name) =>
				name === "JTP" ? "JTP (Original)" : name,
			);
			resolveAccounts();

			await calculator.handle(makeEligibleEvent({ banListName: "JTP" }));

			expect(rankGroupResolver.resolveAlias).toHaveBeenCalledWith("JTP");
			expect(rankRepository.findOrCreateByName).toHaveBeenCalledWith("JTP (Original)");
			expect(rankGroupResolver.groupsFor).toHaveBeenCalledWith("JTP (Original)");
		});

		it("consults the resolver only after the eligibility gate", async () => {
			await calculator.handle(makeEligibleEvent({ ranked: false }));

			expect(rankGroupResolver.resolveAlias).not.toHaveBeenCalled();
			expect(rankGroupResolver.groupsFor).not.toHaveBeenCalled();
		});
	});
});
