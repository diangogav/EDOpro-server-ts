import {
	buildStocMatchmakingFoundFrame,
	buildStocMatchmakingStatusFrame,
	MATCHMAKING_FOUND,
	MATCHMAKING_STATUS,
} from "../ygopro/matchmaking/protocol/matchmaking-protocol";
import { describeFound, describeStatus, takeFrames } from "./matchmaking-harness";

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
