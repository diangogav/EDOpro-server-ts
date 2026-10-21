import { MATCH_ABANDON } from "@shared/messages/server-to-client/MatchAbandonClientMessage";
import { ACHIEVEMENT_UNLOCKED } from "src/plugins/achievements/infrastructure/AchievementUnlockedClientMessage";
import { LOBBY_METADATA } from "@ygopro/room/domain/LobbyMetadata";
import { STOC_EVRP_EXPORT } from "@ygopro/room/domain/replay/evrp-constants";
import {
	MATCHMAKING_FOUND,
	MATCHMAKING_PROPOSED,
	MATCHMAKING_STATUS,
	MAX_MATCH_ID_BYTES,
	MAX_OPPONENT_NAME_BYTES,
	MAX_TICKET_BYTES,
	REASON_TO_CODE,
	buildStocMatchmakingFoundFrame,
	buildStocMatchmakingProposedFrame,
	buildStocMatchmakingStatusFrame,
	parseCtosAuth,
	parseCtosCancel,
	parseCtosEnter,
	parseCtosMatchResponse,
} from "./matchmaking-protocol";

function enterBody(formatCode: number, modeCode: number, clientVersion = 0): Buffer {
	const body = Buffer.alloc(4);
	body.writeUInt8(formatCode, 0);
	body.writeUInt8(modeCode, 1);
	body.writeUInt16LE(clientVersion, 2);
	return body;
}

function enterBodyWithDelay(delayMs: number, clientVersion = 0): Buffer {
	const delay = Buffer.alloc(4);
	delay.writeUInt32LE(delayMs, 0);
	return Buffer.concat([enterBody(0, 0, clientVersion), delay]);
}

function authBody(ticket: string, declaredLength = Buffer.byteLength(ticket, "utf8")): Buffer {
	return Buffer.concat([Buffer.from([declaredLength]), Buffer.from(ticket, "utf8")]);
}

describe("parseCtosAuth", () => {
	it("parses a well-formed ticket", () => {
		const ticket = "9d3f6b1a-1111-4c11-8a11-abcdefabcdef";
		expect(parseCtosAuth(authBody(ticket))).toEqual({ ok: true, value: { ticket } });
	});

	it("rejects a ticketLen that claims more bytes than the frame carries", () => {
		expect(parseCtosAuth(Buffer.from([10, 0x61, 0x62]))).toEqual({
			ok: false,
			reason: "malformed_frame",
		});
	});

	it("rejects a ticketLen beyond MAX_TICKET_BYTES", () => {
		const body = authBody("a".repeat(MAX_TICKET_BYTES + 1));
		expect(parseCtosAuth(body)).toEqual({ ok: false, reason: "malformed_frame" });
	});
});

describe("parseCtosEnter", () => {
	it("parses a 4-byte body as format, mode and clientVersion with no fallback delay", () => {
		expect(parseCtosEnter(enterBody(1, 0, 42))).toEqual({
			ok: true,
			value: { format: "jtp", mode: "ranked", clientVersion: 42 },
		});
	});

	it("parses an 8-byte body, reading the trailing uint32 LE as botFallbackAfterMs", () => {
		expect(parseCtosEnter(enterBodyWithDelay(90_000, 7))).toEqual({
			ok: true,
			value: { format: "tcg", mode: "ranked", clientVersion: 7, botFallbackAfterMs: 90_000 },
		});
	});

	it("keeps the full uint32 range of botFallbackAfterMs", () => {
		expect(parseCtosEnter(enterBodyWithDelay(0xffffffff))).toEqual({
			ok: true,
			value: { format: "tcg", mode: "ranked", clientVersion: 0, botFallbackAfterMs: 0xffffffff },
		});
	});

	it("parses a 5-byte body, reading the trailing byte as the accept-step opt-in", () => {
		expect(parseCtosEnter(Buffer.concat([enterBody(0, 0, 3), Buffer.from([1])]))).toEqual({
			ok: true,
			value: { format: "tcg", mode: "ranked", clientVersion: 3, supportsAcceptStep: true },
		});
	});

	it("parses a 9-byte body as botFallbackAfterMs followed by the accept-step opt-in", () => {
		expect(
			parseCtosEnter(Buffer.concat([enterBodyWithDelay(60_000, 3), Buffer.from([0])])),
		).toEqual({
			ok: true,
			value: {
				format: "tcg",
				mode: "ranked",
				clientVersion: 3,
				botFallbackAfterMs: 60_000,
				supportsAcceptStep: false,
			},
		});
	});

	it("rejects an accept-step byte other than 0 or 1 as malformed", () => {
		expect(parseCtosEnter(Buffer.concat([enterBody(0, 0), Buffer.from([2])]))).toEqual({
			ok: false,
			reason: "malformed_frame",
		});
		expect(parseCtosEnter(Buffer.concat([enterBodyWithDelay(0), Buffer.from([0xff])]))).toEqual({
			ok: false,
			reason: "malformed_frame",
		});
	});

	it.each([0, 3, 6, 7, 10])("rejects a %i-byte body as malformed", (length) => {
		expect(parseCtosEnter(Buffer.alloc(length))).toEqual({ ok: false, reason: "malformed_frame" });
	});

	it("rejects out-of-range format/mode bytes via the frozen code tables", () => {
		expect(parseCtosEnter(enterBody(99, 0))).toEqual({ ok: false, reason: "unknown_format" });
		expect(parseCtosEnter(enterBody(0, 99))).toEqual({ ok: false, reason: "unsupported_mode" });
	});

	it("resolves formats through a fixed code table pinned to the wire contract, not array indexing", () => {
		expect(parseCtosEnter(enterBody(0, 0))).toEqual({
			ok: true,
			value: { format: "tcg", mode: "ranked", clientVersion: 0 },
		});
		expect(parseCtosEnter(enterBody(1, 0))).toEqual({
			ok: true,
			value: { format: "jtp", mode: "ranked", clientVersion: 0 },
		});
		expect(parseCtosEnter(enterBody(2, 0))).toEqual({
			ok: true,
			value: { format: "edison", mode: "ranked", clientVersion: 0 },
		});
	});
});

describe("parseCtosCancel", () => {
	it("accepts an empty body and rejects a non-empty one", () => {
		expect(parseCtosCancel(Buffer.alloc(0))).toEqual({ ok: true, value: {} });
		expect(parseCtosCancel(Buffer.from([1]))).toEqual({ ok: false, reason: "malformed_frame" });
	});
});

describe("parseCtosMatchResponse", () => {
	it("parses a length-prefixed match id", () => {
		const matchId = "9d3f6b1a-1111-4c11-8a11-abcdefabcdef";
		expect(parseCtosMatchResponse(authBody(matchId))).toEqual({ ok: true, value: { matchId } });
	});

	it("rejects an empty body, a length mismatch, an empty id and an oversized id", () => {
		expect(parseCtosMatchResponse(Buffer.alloc(0))).toEqual({
			ok: false,
			reason: "malformed_frame",
		});
		expect(parseCtosMatchResponse(Buffer.from([5, 0x61]))).toEqual({
			ok: false,
			reason: "malformed_frame",
		});
		expect(parseCtosMatchResponse(Buffer.from([0]))).toEqual({
			ok: false,
			reason: "malformed_frame",
		});
		expect(parseCtosMatchResponse(authBody("m".repeat(MAX_MATCH_ID_BYTES + 1)))).toEqual({
			ok: false,
			reason: "malformed_frame",
		});
	});
});

describe("buildStocMatchmakingProposedFrame", () => {
	it("lays out [size LE][0xef][matchIdLen][matchId][acceptWithinMs u32 LE]", () => {
		const matchId = "9d3f6b1a-1111-4c11-8a11-abcdefabcdef";
		const frame = buildStocMatchmakingProposedFrame({ matchId, acceptWithinMs: 20_000 });

		expect(frame.readUInt16LE(0)).toBe(1 + 1 + matchId.length + 4);
		expect(frame.readUInt8(2)).toBe(MATCHMAKING_PROPOSED);
		expect(frame.readUInt8(3)).toBe(matchId.length);
		expect(frame.subarray(4, 4 + matchId.length).toString("utf8")).toBe(matchId);
		expect(frame.readUInt32LE(4 + matchId.length)).toBe(20_000);
	});
});

describe("REASON_TO_CODE", () => {
	it("appends the accept-step reasons after the existing codes", () => {
		expect(REASON_TO_CODE.version_mismatch).toBe(14);
		expect(REASON_TO_CODE.unknown_match).toBe(15);
		expect(REASON_TO_CODE.declined).toBe(16);
		expect(REASON_TO_CODE.accept_timeout).toBe(17);
	});
});

describe("buildStocMatchmakingStatusFrame", () => {
	it("lays out [size LE][0xf8][state][waitedMs u32 LE][reason], size counting the opcode only", () => {
		const frame = buildStocMatchmakingStatusFrame("searching", 0xdeadbeef, "none");
		expect(frame.readUInt16LE(0)).toBe(7); // opcode(1) + state(1) + waitedMs(4) + reason(1)
		expect(frame.readUInt8(2)).toBe(MATCHMAKING_STATUS);
		expect(frame.readUInt8(3)).toBe(0); // searching
		expect(frame.readUInt32LE(4)).toBe(0xdeadbeef);
		expect(frame.readUInt8(8)).toBe(0); // none
	});

	it("encodes a different state/reason pair, proving the tables aren't hardcoded to one case", () => {
		const frame = buildStocMatchmakingStatusFrame("rejected", 0, "invalid_ticket");
		expect(frame.readUInt8(3)).toBe(2); // rejected
		expect(frame.readUInt8(8)).toBe(1); // invalid_ticket
	});
});

describe("buildStocMatchmakingFoundFrame", () => {
	it("lays out opponentType, rated, roomId LE, matchId then opponentName in order", () => {
		const frame = buildStocMatchmakingFoundFrame({
			opponentType: "human",
			rated: true,
			roomId: 4242,
			matchId: "9d3f6b1a-1111-4c11-8a11-abcdefabcdef",
			opponentName: "Kaiba",
		});

		expect(frame.readUInt8(2)).toBe(MATCHMAKING_FOUND);
		expect(frame.readUInt8(3)).toBe(0); // human
		expect(frame.readUInt8(4)).toBe(1); // rated
		expect(frame.readUInt16LE(5)).toBe(4242);

		const matchIdLen = frame.readUInt8(7);
		expect(frame.subarray(8, 8 + matchIdLen).toString("utf8")).toBe(
			"9d3f6b1a-1111-4c11-8a11-abcdefabcdef",
		);
		const nameOffset = 8 + matchIdLen;
		const nameLen = frame.readUInt8(nameOffset);
		expect(frame.subarray(nameOffset + 1, nameOffset + 1 + nameLen).toString("utf8")).toBe("Kaiba");
	});

	it("encodes a bot opponent with no name as zero name bytes", () => {
		const frame = buildStocMatchmakingFoundFrame({
			opponentType: "bot",
			rated: false,
			roomId: 1,
			matchId: "m",
			opponentName: null,
		});
		const matchIdLen = frame.readUInt8(7);
		expect(frame.readUInt8(3)).toBe(1); // bot
		expect(frame.readUInt8(4)).toBe(0); // not rated
		expect(frame.readUInt8(8 + matchIdLen)).toBe(0);
	});

	it("truncates an oversized opponent name to the last complete UTF-8 code point within 32 bytes", () => {
		const longName = "字".repeat(15); // 45 bytes, 3 bytes per character
		const frame = buildStocMatchmakingFoundFrame({
			opponentType: "human",
			rated: true,
			roomId: 1,
			matchId: "m",
			opponentName: longName,
		});

		const matchIdLen = frame.readUInt8(7);
		const nameOffset = 8 + matchIdLen;
		const nameLen = frame.readUInt8(nameOffset);
		const nameBytes = frame.subarray(nameOffset + 1, nameOffset + 1 + nameLen);

		expect(nameLen).toBeLessThanOrEqual(MAX_OPPONENT_NAME_BYTES);
		expect(nameLen).toBe(30); // 10 complete 3-byte characters
		expect(nameBytes.toString("utf8")).toBe("字".repeat(10));
	});
});

describe("server-to-client opcode allocation", () => {
	it("gives the match proposal an opcode no other server-to-client extension uses", () => {
		expect([
			MATCH_ABANDON,
			ACHIEVEMENT_UNLOCKED,
			LOBBY_METADATA,
			STOC_EVRP_EXPORT,
			MATCHMAKING_STATUS,
			MATCHMAKING_FOUND,
		]).not.toContain(MATCHMAKING_PROPOSED);
	});
});
