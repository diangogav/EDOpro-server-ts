import { mock } from "jest-mock-extended";

import { Team } from "@shared/room/Team";
import { MatchContext } from "@shared/room/domain/lifecycle/MatchLifecycleHook";
import { Rating } from "@shared/stats/rating/domain/Rating";
import { RatingRepository } from "@shared/stats/rating/domain/RatingRepository";
import { LoggerMock } from "@test-support/mocks/logger/LoggerMock";

import { RatingAnnouncer } from "./RatingAnnouncer";

function makeContext(overrides?: Partial<MatchContext>): MatchContext {
	return {
		roomId: 1234,
		ranked: true,
		banListName: "TCG",
		season: 5,
		players: [
			{ id: "p1", team: Team.PLAYER, name: "Diango", winner: false },
			{ id: "p2", team: Team.OPPONENT, name: "Rival", winner: false },
		],
		announce: jest.fn(),
		...overrides,
	};
}

describe("RatingAnnouncer", () => {
	let repository: ReturnType<typeof mock<RatingRepository>>;
	let logger: LoggerMock;
	let announcer: RatingAnnouncer;

	beforeEach(() => {
		repository = mock<RatingRepository>();
		logger = new LoggerMock();
		announcer = new RatingAnnouncer(repository, logger);
	});

	describe("onMatchStarted", () => {
		it("announces each player's current rating for an eligible match", async () => {
			repository.findMany.mockResolvedValue(
				new Map([
					["p1", Rating.from({ value: 1050, gamesPlayed: 12, peak: 1080 })],
					["p2", Rating.from({ value: 950, gamesPlayed: 12, peak: 980 })],
				]),
			);
			const ctx = makeContext();

			await announcer.onMatchStarted(ctx);

			expect(repository.findMany).toHaveBeenCalledWith(["p1", "p2"], "TCG", 5);
			expect(ctx.announce).toHaveBeenCalledWith("[Rating v1 start] Diango 1050 | Rival 950");
		});

		it("defaults to the season-start rating (1000) for a player with no row", async () => {
			repository.findMany.mockResolvedValue(new Map());
			const ctx = makeContext();

			await announcer.onMatchStarted(ctx);

			expect(ctx.announce).toHaveBeenCalledWith("[Rating v1 start] Diango 1000 | Rival 1000");
		});

		it("stays completely silent for an unranked match", async () => {
			const ctx = makeContext({ ranked: false });

			await announcer.onMatchStarted(ctx);

			expect(repository.findMany).not.toHaveBeenCalled();
			expect(ctx.announce).not.toHaveBeenCalled();
		});

		it("stays completely silent when the banlist is N/A", async () => {
			const ctx = makeContext({ banListName: "N/A" });

			await announcer.onMatchStarted(ctx);

			expect(repository.findMany).not.toHaveBeenCalled();
			expect(ctx.announce).not.toHaveBeenCalled();
		});

		it("stays completely silent when a player has no account id", async () => {
			const ctx = makeContext({
				players: [
					{ id: null, team: Team.PLAYER, name: "Bot", winner: false },
					{ id: "p2", team: Team.OPPONENT, name: "Rival", winner: false },
				],
			});

			await announcer.onMatchStarted(ctx);

			expect(repository.findMany).not.toHaveBeenCalled();
			expect(ctx.announce).not.toHaveBeenCalled();
		});

		it("is a no-op on a second call for the same match (drawn-game-1 idempotence)", async () => {
			repository.findMany.mockResolvedValue(new Map());
			const ctx = makeContext();

			await announcer.onMatchStarted(ctx);
			await announcer.onMatchStarted(ctx);

			expect(repository.findMany).toHaveBeenCalledTimes(1);
			expect(ctx.announce).toHaveBeenCalledTimes(1);
		});

		it("does not throw and sends no frame when the repository read fails", async () => {
			repository.findMany.mockRejectedValue(new Error("db down"));
			const ctx = makeContext();

			await expect(announcer.onMatchStarted(ctx)).resolves.toBeUndefined();

			expect(ctx.announce).not.toHaveBeenCalled();
		});
	});

	describe("onMatchEnding", () => {
		it("computes deltas via the pure EloCalculator from the start snapshot and announces them", async () => {
			repository.findMany.mockResolvedValue(
				new Map([
					["p1", Rating.from({ value: 1000, gamesPlayed: 12, peak: 1000 })],
					["p2", Rating.from({ value: 1000, gamesPlayed: 12, peak: 1000 })],
				]),
			);
			const startCtx = makeContext();
			await announcer.onMatchStarted(startCtx);

			const endCtx = makeContext({
				players: [
					{ id: "p1", team: Team.PLAYER, name: "Diango", winner: true },
					{ id: "p2", team: Team.OPPONENT, name: "Rival", winner: false },
				],
			});

			await announcer.onMatchEnding(endCtx);

			expect(endCtx.announce).toHaveBeenCalledWith(
				"[Rating v1 end] Diango 1010 (+10) | Rival 990 (-10)",
			);
		});

		it("stays silent when the match was never announced at start (ineligible or aborted before start)", async () => {
			const ctx = makeContext();

			await announcer.onMatchEnding(ctx);

			expect(ctx.announce).not.toHaveBeenCalled();
		});

		it("clears the snapshot so a later match reusing the same roomId starts fresh", async () => {
			repository.findMany.mockResolvedValue(new Map());
			const ctx = makeContext();
			await announcer.onMatchStarted(ctx);
			await announcer.onMatchEnding(ctx);
			repository.findMany.mockClear();

			await announcer.onMatchStarted(ctx);

			expect(repository.findMany).toHaveBeenCalledTimes(1);
		});
	});
});
