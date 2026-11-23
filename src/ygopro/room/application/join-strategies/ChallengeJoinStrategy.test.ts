import { mock } from "jest-mock-extended";

import { ChallengeRoomBook } from "@shared/challenge/application/ChallengeRoomBook";

import { ChallengeJoinStrategy } from "./ChallengeJoinStrategy";
import { JoinContext, JoinStrategy } from "./JoinStrategy";

const makeCtx = (overrides: Partial<JoinContext> = {}, resolvedUserId?: string): JoinContext =>
	({
		rawPass: "ch#token00000000001",
		command: "ch",
		password: "token00000000001",
		socket: { id: "sock-1", resolvedUserId },
		socketId: "sock-1",
		...overrides,
	}) as unknown as JoinContext;

const makeBook = () => {
	let tokens = 0;
	let now = 0;
	const book = new ChallengeRoomBook({
		now: () => now,
		randomToken: () => `token${String(++tokens).padStart(11, "0")}`,
	});

	return {
		book,
		advance: (ms: number) => {
			now += ms;
		},
	};
};

const strategyMatching = (predicate: (ctx: JoinContext) => boolean) => {
	const strategy = mock<JoinStrategy>();
	strategy.matches.mockImplementation(predicate);
	strategy.handle.mockResolvedValue(undefined);

	return strategy;
};

describe("ChallengeJoinStrategy", () => {
	it("matches only the ch command", () => {
		const strategy = new ChallengeJoinStrategy(undefined, []);

		expect(strategy.matches(makeCtx())).toBe(true);
		expect(strategy.matches(makeCtx({ command: "chess", rawPass: "chess" }))).toBe(false);
		expect(strategy.matches(makeCtx({ command: "tcg", rawPass: "tcg" }))).toBe(false);
	});

	it("rewrites a casual challenge join to the stored room and hands it to the first matching strategy", async () => {
		const { book } = makeBook();
		const room = book.issue({ format: "tcg", ranked: false, userIds: [] });
		const ticket = strategyMatching((ctx) => Boolean(ctx.socket.resolvedUserId));
		const fallback = strategyMatching(() => true);
		const strategy = new ChallengeJoinStrategy(book, [ticket, fallback]);

		await strategy.handle(makeCtx({ password: room.code, rawPass: `ch#${room.code}` }));

		const expected = {
			command: "toot,casual",
			password: room.password,
			rawPass: `toot,casual#${room.password}`,
		};
		expect(ticket.handle).not.toHaveBeenCalled();
		expect(fallback.handle).toHaveBeenCalledTimes(1);
		expect(fallback.handle).toHaveBeenCalledWith(expect.objectContaining(expected));
		expect(fallback.handle.mock.calls[0][0].socketId).toBe("sock-1");
	});

	it("lets either account of a ranked challenge in through the rest of the chain", async () => {
		const { book } = makeBook();
		const room = book.issue({ format: "goat", ranked: true, userIds: ["user-1", "user-2"] });
		const ticket = strategyMatching((ctx) => Boolean(ctx.socket.resolvedUserId));
		const strategy = new ChallengeJoinStrategy(book, [ticket]);

		await strategy.handle(makeCtx({ password: room.code }, "user-2"));

		expect(ticket.handle).toHaveBeenCalledWith(
			expect.objectContaining({
				command: "goat",
				password: room.password,
				rawPass: `goat#${room.password}`,
			}),
		);
	});

	it("refuses a ranked challenge room to a socket that is not one of its two accounts", async () => {
		const { book } = makeBook();
		const room = book.issue({ format: "goat", ranked: true, userIds: ["user-1", "user-2"] });
		const ticket = strategyMatching(() => true);
		const strategy = new ChallengeJoinStrategy(book, [ticket]);

		await expect(strategy.handle(makeCtx({ password: room.code }, "user-3"))).rejects.toThrow(
			"challenge join refused: not a player of this ranked room",
		);
		await expect(strategy.handle(makeCtx({ password: room.code }))).rejects.toThrow(
			"challenge join refused: not a player of this ranked room",
		);
		expect(ticket.handle).not.toHaveBeenCalled();
	});

	it("refuses an unknown or expired code", async () => {
		const { book, advance } = makeBook();
		const room = book.issue({ format: "edison", ranked: false, userIds: [] });
		const fallback = strategyMatching(() => true);
		const strategy = new ChallengeJoinStrategy(book, [fallback]);

		await expect(strategy.handle(makeCtx({ password: "unknown000000000" }))).rejects.toThrow(
			"challenge join refused: unknown or expired code",
		);
		advance(10 * 60_000);
		await expect(strategy.handle(makeCtx({ password: room.code }))).rejects.toThrow(
			"challenge join refused: unknown or expired code",
		);
		expect(fallback.handle).not.toHaveBeenCalled();
	});

	it("refuses every challenge join when no challenge rooms are wired", async () => {
		const fallback = strategyMatching(() => true);
		const strategy = new ChallengeJoinStrategy(undefined, [fallback]);

		await expect(strategy.handle(makeCtx())).rejects.toThrow(
			"challenge join refused: unknown or expired code",
		);
		expect(fallback.handle).not.toHaveBeenCalled();
	});
});
