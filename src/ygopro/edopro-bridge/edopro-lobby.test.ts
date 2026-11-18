import { decodeEdoproHostInfo, duelRuleFromFlags } from "./edopro-lobby";

const HOST_INFO_BYTES = 68;
const MASTER_RULE_1 = 0xd0700;

function hostInfo(fields: {
	team1?: number;
	team2?: number;
	bestOf?: number;
	lflist?: number;
}): Uint8Array {
	const body = new Uint8Array(HOST_INFO_BYTES);
	const view = new DataView(body.buffer);
	view.setUint32(0, fields.lflist ?? 0, true);
	view.setUint32(12, 8000, true);
	view.setUint8(16, 5);
	view.setUint8(17, 1);
	view.setUint16(18, 120, true);
	view.setInt32(32, fields.team1 ?? 1, true);
	view.setInt32(36, fields.team2 ?? 1, true);
	view.setInt32(40, fields.bestOf ?? 1, true);
	view.setUint32(44, MASTER_RULE_1, true);

	return body;
}

describe("decodeEdoproHostInfo", () => {
	it("reads a best-of-one room as a single duel", () => {
		expect(decodeEdoproHostInfo(hostInfo({ bestOf: 1 })).hostInfo.mode).toBe(0);
	});

	it("reads a best-of-three room as a match, though EDOPro leaves the mode byte at 0", () => {
		const room = decodeEdoproHostInfo(hostInfo({ bestOf: 3 }));

		expect(room.hostInfo.mode).toBe(1);
		expect(room.bestOf).toBe(3);
	});

	it("reads a room with a team of two as a tag duel, whatever its best-of count", () => {
		expect(decodeEdoproHostInfo(hostInfo({ team1: 2, team2: 2, bestOf: 3 })).hostInfo.mode).toBe(2);
	});

	it("keeps the life points, hand, draw, time limit and ban list hash", () => {
		const { hostInfo: info } = decodeEdoproHostInfo(hostInfo({ lflist: 0xabcdef01 }));

		expect(info).toMatchObject({
			lflist: 0xabcdef01,
			start_lp: 8000,
			start_hand: 5,
			draw_count: 1,
			time_limit: 120,
			duel_rule: duelRuleFromFlags(MASTER_RULE_1),
		});
	});
});
