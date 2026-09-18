import {
	MATCHMAKING_FOUND,
	MATCHMAKING_STATUS,
	MAX_OPPONENT_NAME_BYTES,
	MAX_TICKET_BYTES,
	buildStocMatchmakingFoundFrame,
	buildStocMatchmakingStatusFrame,
	parseCtosAuth,
	parseCtosCancel,
	parseCtosEnter,
} from "./matchmaking-protocol";

function enterBody(formatCode: number, modeCode: number, clientVersion = 0): Buffer {
	const body = Buffer.alloc(4);
	body.writeUInt8(formatCode, 0);
	body.writeUInt8(modeCode, 1);
	body.writeUInt16LE(clientVersion, 2);
	return body;
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
	it("parses format, mode and clientVersion from the fixed 4-byte body", () => {
		expect(parseCtosEnter(enterBody(1, 0, 42))).toEqual({
			ok: true,
			value: { format: "jtp", mode: "ranked", clientVersion: 42 },
		});
	});

	it("rejects a body shorter or longer than the fixed 4 bytes", () => {
		expect(parseCtosEnter(Buffer.alloc(3))).toEqual({ ok: false, reason: "malformed_frame" });
		expect(parseCtosEnter(Buffer.alloc(5))).toEqual({ ok: false, reason: "malformed_frame" });
	});

	it("rejects out-of-range format/mode bytes via the frozen code tables", () => {
		expect(parseCtosEnter(enterBody(99, 0))).toEqual({ ok: false, reason: "unknown_format" });
		expect(parseCtosEnter(enterBody(0, 99))).toEqual({ ok: false, reason: "unsupported_mode" });
	});

	it("resolves formats through a fixed code table pinned to the wire contract, not array indexing", () => {
		const tcg = parseCtosEnter(enterBody(0, 0));
		const jtp = parseCtosEnter(enterBody(1, 0));
		const edison = parseCtosEnter(enterBody(2, 0));
		expect(tcg.ok && tcg.value.format).toBe("tcg");
		expect(jtp.ok && jtp.value.format).toBe("jtp");
		expect(edison.ok && edison.value.format).toBe("edison");
	});
});

describe("parseCtosCancel", () => {
	it("accepts an empty body and rejects a non-empty one", () => {
		expect(parseCtosCancel(Buffer.alloc(0))).toEqual({ ok: true, value: {} });
		expect(parseCtosCancel(Buffer.from([1]))).toEqual({ ok: false, reason: "malformed_frame" });
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
