import { mock, MockProxy } from "jest-mock-extended";
import { Logger } from "@shared/logger/domain/Logger";
import { Team } from "@shared/room/Team";
import { Rating } from "@shared/stats/rating/domain/Rating";
import { RatingRepository, RatingTransaction } from "@shared/stats/rating/domain/RatingRepository";
import { UserProfileRepository } from "@shared/user-profile/domain/UserProfileRepository";
import { GameOverDomainEventMother } from "@test-support/mothers/player/GameOverDomainEventMother";
import { PlayerMother } from "@test-support/mothers/player/PlayerMother";
import { RatingMother } from "@test-support/mothers/player/RatingMother";
import { UserProfileMother } from "@test-support/mothers/user-profile/UserProfileMother";

import { config } from "../../../config/index";
import { EloRatingCalculator } from "./EloRatingCalculator";

describe("EloRatingCalculator", () => {
	let calculator: EloRatingCalculator;
	let logger: MockProxy<Logger>;
	let userProfileRepository: MockProxy<UserProfileRepository>;
	let ratingRepository: MockProxy<RatingRepository>;
	let tx: MockProxy<RatingTransaction>;

	beforeEach(() => {
		logger = mock<Logger>();
		logger.child.mockReturnValue(logger);
		userProfileRepository = mock<UserProfileRepository>();
		ratingRepository = mock<RatingRepository>();
		tx = mock<RatingTransaction>();
		tx.insertHistory.mockResolvedValue(true);

		calculator = new EloRatingCalculator(logger, userProfileRepository, ratingRepository);
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

			expect(ratingRepository.transaction).toHaveBeenCalledWith(
				expect.arrayContaining(["player-1", "player-2"]),
				"TCG",
				config.season,
				expect.any(Function),
			);

			expect(tx.insertHistory).toHaveBeenCalledWith(
				expect.objectContaining({
					matchId: "match-1",
					userId: "player-1",
					banListName: "TCG",
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
				"TCG",
				config.season,
				Rating.from({ value: 1010, gamesPlayed: 21, peak: 1010 }),
			);
			expect(tx.saveRating).toHaveBeenCalledWith(
				"player-2",
				"TCG",
				config.season,
				Rating.from({ value: 990, gamesPlayed: 21, peak: 1000 }),
			);
		});
	});

	describe("S8 — unranked match excluded", () => {
		it("writes no rating row when the match is not ranked", async () => {
			await calculator.handle(makeEligibleEvent({ ranked: false }));

			expect(ratingRepository.transaction).not.toHaveBeenCalled();
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
});
