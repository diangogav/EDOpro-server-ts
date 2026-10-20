import {
	buildStocMatchmakingFoundFrame,
	buildStocMatchmakingStatusFrame,
	MATCHMAKING_FOUND,
	MATCHMAKING_STATUS,
} from "../ygopro/matchmaking/protocol/matchmaking-protocol";
import {
	describeFound,
	describeStatus,
	enterFrame,
	parseOptions,
	takeFrames,
} from "./matchmaking-harness";

describe("matchmaking harness decoding", () => {
	it("reads a status frame the server built", () => {
		const frame = buildStocMatchmakingStatusFrame("searching", 4200);

		const { frames, consumed } = takeFrames(frame);

		expect(consumed).toBe(frame.length);
		expect(frames).toHaveLength(1);
		expect(frames[0]?.opcode).toBe(MATCHMAKING_STATUS);
		expect(describeStatus(frames[0]?.body as Buffer)).toEqual({
			state: "searching",
			waitedMs: 4200,
			reason: "none",
		});
	});

	it("reads a rejection reason the server built", () => {
		const frame = buildStocMatchmakingStatusFrame("rejected", 0, "invalid_ticket");

		const { frames } = takeFrames(frame);

		expect(describeStatus(frames[0]?.body as Buffer)).toEqual({
			state: "rejected",
			waitedMs: 0,
			reason: "invalid_ticket",
		});
	});

	it("reads a human match the server built", () => {
		const frame = buildStocMatchmakingFoundFrame({
			opponentType: "human",
			rated: true,
			roomId: 4321,
			matchId: "match-1",
			opponentName: "DuelKing",
		});

		const { frames } = takeFrames(frame);

		expect(frames[0]?.opcode).toBe(MATCHMAKING_FOUND);
		expect(describeFound(frames[0]?.body as Buffer)).toEqual({
			opponentType: "human",
			rated: true,
			roomId: 4321,
			matchId: "match-1",
			opponentName: "DuelKing",
		});
	});

	it("reads a nameless bot match the server built", () => {
		const frame = buildStocMatchmakingFoundFrame({
			opponentType: "bot",
			rated: false,
			roomId: 7,
			matchId: "match-2",
			opponentName: null,
		});

		const { frames } = takeFrames(frame);

		expect(describeFound(frames[0]?.body as Buffer)).toEqual({
			opponentType: "bot",
			rated: false,
			roomId: 7,
			matchId: "match-2",
			opponentName: "",
		});
	});

	it("splits two frames arriving in one chunk", () => {
		const chunk = Buffer.concat([
			buildStocMatchmakingStatusFrame("authenticated", 0),
			buildStocMatchmakingStatusFrame("searching", 0),
		]);

		const { frames, consumed } = takeFrames(chunk);

		expect(consumed).toBe(chunk.length);
		expect(frames.map((frame) => describeStatus(frame.body).state)).toEqual([
			"authenticated",
			"searching",
		]);
	});

	it("leaves a partial frame for the next chunk", () => {
		const frame = buildStocMatchmakingStatusFrame("searching", 1);

		const { frames, consumed } = takeFrames(frame.subarray(0, frame.length - 2));

		expect(frames).toHaveLength(0);
		expect(consumed).toBe(0);
	});
});

describe("matchmaking harness options", () => {
	const base = ["--ticket", "t-1", "--name", "Duelist"];

	it("leaves the bot fallback delay unset by default", () => {
		expect(parseOptions(base).botFallbackAfterMs).toBeUndefined();
	});

	it("reads --bot-fallback-after-ms as an integer", () => {
		expect(parseOptions([...base, "--bot-fallback-after-ms", "45000"]).botFallbackAfterMs).toBe(
			45_000,
		);
	});

	it("accepts the largest delay that fits the uint32 socket field", () => {
		expect(
			parseOptions([...base, "--bot-fallback-after-ms", "4294967295"]).botFallbackAfterMs,
		).toBe(0xffffffff);
	});

	it.each([
		"abc",
		"4294967296",
		"-1",
		"1.5",
		"",
		"true",
	])("rejects --bot-fallback-after-ms %p with a usage error", (value) => {
		expect(() => parseOptions([...base, "--bot-fallback-after-ms", value])).toThrow(
			/--bot-fallback-after-ms must be a non-negative integer/,
		);
	});
});

describe("matchmaking harness enter frame", () => {
	const bodyOf = (frame: Buffer) => takeFrames(frame).frames[0]?.body as Buffer;

	it("sends a 4-byte ENTER body without a delay", () => {
		expect(bodyOf(enterFrame("tcg", undefined))).toHaveLength(4);
	});

	it("appends the delay as a uint32 LE", () => {
		const body = bodyOf(enterFrame("tcg", 90_000));

		expect(body).toHaveLength(8);
		expect(body.readUInt32LE(4)).toBe(90_000);
	});
});
