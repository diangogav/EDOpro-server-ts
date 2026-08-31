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
		matchId: "match-a",
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

		it("clears the snapshot so a later call for the same matchId starts fresh", async () => {
			repository.findMany.mockResolvedValue(new Map());
			const ctx = makeContext();
			await announcer.onMatchStarted(ctx);
			await announcer.onMatchEnding(ctx);
			repository.findMany.mockClear();

			await announcer.onMatchStarted(ctx);

			expect(repository.findMany).toHaveBeenCalledTimes(1);
		});
	});

	describe("stale-roomId regression — a new match reusing an abandoned match's roomId", () => {
		it("announces its own start ratings, not the abandoned match's, and is not blocked as a no-op", async () => {
			repository.findMany.mockResolvedValueOnce(
				new Map([
					["p1", Rating.from({ value: 1000, gamesPlayed: 12, peak: 1000 })],
					["p2", Rating.from({ value: 1000, gamesPlayed: 12, peak: 1000 })],
				]),
			);
			const abandonedStart = makeContext({ roomId: 4242, matchId: "match-abandoned" });
			await announcer.onMatchStarted(abandonedStart);
			// The abandoned match never reaches onMatchEnding — no teardown hook
			// fires either in this scenario, reproducing the reported defect
			// exactly: only matchId-based keying, not any explicit cleanup,
			// must keep the next match correct.

			repository.findMany.mockResolvedValueOnce(
				new Map([
					["p1", Rating.from({ value: 1200, gamesPlayed: 20, peak: 1200 })],
					["p2", Rating.from({ value: 800, gamesPlayed: 20, peak: 800 })],
				]),
			);
			const freshStart = makeContext({ roomId: 4242, matchId: "match-fresh" });

			await announcer.onMatchStarted(freshStart);

			expect(repository.findMany).toHaveBeenCalledTimes(2);
			expect(freshStart.announce).toHaveBeenCalledWith("[Rating v1 start] Diango 1200 | Rival 800");
		});

		it("computes the new match's END deltas from its own snapshot, not the abandoned match's", async () => {
			repository.findMany.mockResolvedValueOnce(
				new Map([
					["p1", Rating.from({ value: 1000, gamesPlayed: 12, peak: 1000 })],
					["p2", Rating.from({ value: 1000, gamesPlayed: 12, peak: 1000 })],
				]),
			);
			await announcer.onMatchStarted(makeContext({ roomId: 4242, matchId: "match-abandoned" }));

			repository.findMany.mockResolvedValueOnce(
				new Map([
					["p1", Rating.from({ value: 1200, gamesPlayed: 20, peak: 1200 })],
					["p2", Rating.from({ value: 800, gamesPlayed: 20, peak: 800 })],
				]),
			);
			await announcer.onMatchStarted(makeContext({ roomId: 4242, matchId: "match-fresh" }));

			const freshEnd = makeContext({
				roomId: 4242,
				matchId: "match-fresh",
				players: [
					{ id: "p1", team: Team.PLAYER, name: "Diango", winner: true },
					{ id: "p2", team: Team.OPPONENT, name: "Rival", winner: false },
				],
			});

			await announcer.onMatchEnding(freshEnd);

			expect(freshEnd.announce).toHaveBeenCalledWith(
				"[Rating v1 end] Diango 1202 (+2) | Rival 798 (-2)",
			);
		});
	});

	describe("onRoomClosed", () => {
		it("deletes the snapshot for that exact matchId", async () => {
			repository.findMany.mockResolvedValue(new Map());
			const ctx = makeContext();
			await announcer.onMatchStarted(ctx);
			repository.findMany.mockClear();
			(ctx.announce as jest.Mock).mockClear();

			await announcer.onRoomClosed({ roomId: ctx.roomId, matchId: ctx.matchId });

			await announcer.onMatchEnding(ctx);
			expect(ctx.announce).not.toHaveBeenCalled();
		});

		it("is a no-op when no snapshot exists for that roomId/matchId pair", async () => {
			await expect(
				announcer.onRoomClosed({ roomId: 9999, matchId: "never-started" }),
			).resolves.toBeUndefined();
		});

		it("does not delete a DIFFERENT, still-active match's snapshot on the same roomId", async () => {
			repository.findMany.mockResolvedValue(new Map());
			const staleClose = { roomId: 4242, matchId: "match-old" };
			const active = makeContext({ roomId: 4242, matchId: "match-active" });
			await announcer.onMatchStarted(active);
			repository.findMany.mockClear();

			// A close event for an already-superseded matchId on this roomId must
			// never evict the CURRENT match's snapshot.
			await announcer.onRoomClosed(staleClose);
			await announcer.onMatchEnding(active);

			expect(active.announce).toHaveBeenCalledTimes(2); // start + end
		});

		it("never throws, isolating the runner's per-hook try/catch from any internal failure", async () => {
			await expect(announcer.onRoomClosed({ roomId: 1, matchId: "x" })).resolves.not.toThrow();
		});
	});
});
