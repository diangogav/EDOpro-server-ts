import { gunzipSync } from "node:zlib";

import { GameMode } from "ygopro-msg-encode";

import { DuelRecordMother } from "@test-support/mothers/room/DuelRecordMother";

import { EVRP_CHUNK_BYTES, EVRP_VERSION, STOC_EVRP_EXPORT } from "./evrp-constants";
import { EvrpSerializer } from "./EvrpSerializer";

const HOST_INFO = {
	lflist: 0,
	rule: 1,
	mode: GameMode.SINGLE,
	duel_rule: 5,
	no_check_deck: 0,
	no_shuffle_deck: 0,
	start_lp: 8000,
	start_hand: 5,
	draw_count: 1,
	time_limit: 450,
	max_deck_points: 100,
	best_of: 1,
};

// Local structural stub: the serializer accepts EvrpRoomContext (players +
// hostInfo), not a full YGOProRoom — building a real room via its Mother would
// require the join flow just to populate two fields.
const makeRoom = () => ({
	players: [{ name: "P1" }, { name: "P2" }] as Array<{ name: string }>,
	hostInfo: HOST_INFO,
});

describe("EvrpSerializer.serialize()", () => {
	it("produces a gzip buffer that gunzips without error", () => {
		const gz = EvrpSerializer.serialize(makeRoom(), [DuelRecordMother.create()]);
		expect(() => gunzipSync(gz)).not.toThrow();
	});

	it("writes the current envelope version at the JSON root", () => {
		const gz = EvrpSerializer.serialize(makeRoom(), [DuelRecordMother.create()]);
		const parsed = JSON.parse(gunzipSync(gz).toString("utf8"));
		expect(parsed.version).toBe(EVRP_VERSION);
	});

	it("carries players, hostInfo, startTime and endTime in meta", () => {
		const gz = EvrpSerializer.serialize(makeRoom(), [DuelRecordMother.create()]);
		const { meta } = JSON.parse(gunzipSync(gz).toString("utf8"));
		expect(Array.isArray(meta.players)).toBe(true);
		expect(meta.players).toHaveLength(2);
		expect(meta.players[0].name).toBe("P1");
		expect(meta.hostInfo).toBeDefined();
		expect(typeof meta.startTime).toBe("string");
		expect(typeof meta.endTime).toBe("string");
	});

	it("emits one duels[] entry per record, each with seed, startTime and frames", () => {
		const records = [DuelRecordMother.create(), DuelRecordMother.create()];
		const gz = EvrpSerializer.serialize(makeRoom(), records);
		const { duels } = JSON.parse(gunzipSync(gz).toString("utf8"));
		expect(duels).toHaveLength(2);
		for (const duel of duels) {
			expect(Array.isArray(duel.seed)).toBe(true);
			expect(typeof duel.startTime).toBe("string");
			expect(Array.isArray(duel.frames)).toBe(true);
		}
	});

	it("emits only the synthetic win frame when a record has no messages but a resolved winner", () => {
		// No messages recorded, but winPosition/winReason are set, so the win frame
		// is appended and nothing else.
		const gz = EvrpSerializer.serialize(makeRoom(), [DuelRecordMother.create()]);
		const { duels } = JSON.parse(gunzipSync(gz).toString("utf8"));
		expect(duels[0].frames).toHaveLength(1);
	});

	it("emits no frames when the match is abandoned with no winner", () => {
		const record = DuelRecordMother.create({ winPosition: undefined, winReason: undefined });
		const gz = EvrpSerializer.serialize(makeRoom(), [record]);
		const { duels } = JSON.parse(gunzipSync(gz).toString("utf8"));
		expect(duels[0].frames).toEqual([]);
	});
});

describe("EvrpSerializer.toFrames()", () => {
	it("emits a single frame for a buffer smaller than one chunk", () => {
		const frames = EvrpSerializer.toFrames(Buffer.from("hello world"));
		expect(frames).toHaveLength(1);
	});

	it("emits ceil(length / chunkBytes) frames", () => {
		const gz = Buffer.alloc(EVRP_CHUNK_BYTES + 1, 0xab);
		expect(EvrpSerializer.toFrames(gz)).toHaveLength(2);
	});

	it("keeps every frame within the 65535-byte wire ceiling", () => {
		const frames = EvrpSerializer.toFrames(Buffer.alloc(EVRP_CHUNK_BYTES * 3, 0x42));
		for (const frame of frames) {
			expect(frame.length).toBeLessThanOrEqual(65535);
		}
	});

	it("sizes the final chunk to the remaining bytes", () => {
		const remainder = 100;
		const frames = EvrpSerializer.toFrames(Buffer.alloc(EVRP_CHUNK_BYTES + remainder, 0x33));
		const headerBytes = 8; // len:2 + opcode:1 + version:1 + index:2 + count:2
		expect(frames[1].length - headerBytes).toBe(remainder);
	});

	it("prefixes each frame with LE length, the opcode and the version", () => {
		const frame = EvrpSerializer.toFrames(Buffer.from("test payload"))[0];
		const bodyLen = frame.length - 2;
		expect(frame[0]).toBe(bodyLen & 0xff);
		expect(frame[1]).toBe((bodyLen >> 8) & 0xff);
		expect(frame[2]).toBe(STOC_EVRP_EXPORT);
		expect(frame[3]).toBe(EVRP_VERSION);
	});

	it("encodes chunk index and count as little-endian uint16", () => {
		const [f0, f1] = EvrpSerializer.toFrames(Buffer.alloc(EVRP_CHUNK_BYTES + 1, 0xff));
		expect(f0[6]).toBe(2);
		expect(f0[7]).toBe(0);
		expect(f0[4]).toBe(0);
		expect(f0[5]).toBe(0);
		expect(f1[4]).toBe(1);
		expect(f1[5]).toBe(0);
	});

	it("copies each gzip slice into its frame payload verbatim", () => {
		const gz = Buffer.alloc(EVRP_CHUNK_BYTES + 50, 0x77);
		gz[0] = 0x1f;
		gz[EVRP_CHUNK_BYTES] = 0xaa;
		const frames = EvrpSerializer.toFrames(gz);
		expect(frames[0][8]).toBe(0x1f);
		expect(frames[1][8]).toBe(0xaa);
	});
});
