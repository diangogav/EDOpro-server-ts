import EventEmitter from "events";

import { Mode } from "../../../../src/mercury/room/domain/host-info/Mode.enum";
import { MercuryRoom } from "../../../../src/mercury/room/domain/MercuryRoom";
import { Pino } from "../../../../src/modules/shared/logger/infrastructure/Pino";

describe("MercuryRoom", () => {
	const logger = new Pino();
	const emitter = new EventEmitter();
	const id = 1;
	it("Should create a room with `mode` 1 (Match) when command has `m`", () => {
		const room = MercuryRoom.create(id, "m#123", logger, emitter);
		expect(room.hostInfo.mode).toBe(Mode.MATCH);
	});

	it("Should create a room with `mode` 2 (Tag) and `startLp` 16000 when command has `t`", () => {
		const room = MercuryRoom.create(id, "t#123", logger, emitter);
		expect(room.hostInfo.mode).toBe(Mode.TAG);
		expect(room.hostInfo.startLp).toBe(16000);
	});

	it("Should create a room with startLp passing by `lp` command: example lp4000 should create a room with `startLp` equal to 4000", () => {
		const room = MercuryRoom.create(id, "lp4000#123", logger, emitter);
		expect(room.hostInfo.startLp).toBe(4000);
	});

	it("Should create a room with Match mode and 6000 lps if command is lp6000,m#123", () => {
		const room = MercuryRoom.create(id, "lp6000,m#123", logger, emitter);
		expect(room.hostInfo.startLp).toBe(6000);
		expect(room.hostInfo.mode).toBe(Mode.MATCH);
	});

	it("Should create a room with Tag mode and 12000 lps if command is t,lp12000#123", () => {
		const room = MercuryRoom.create(id, "t,lp12000#123", logger, emitter);
		expect(room.hostInfo.startLp).toBe(12000);
		expect(room.hostInfo.mode).toBe(Mode.TAG);
	});

	it("Should create a room with Tag mode and 12000 lps if command is lp12000,t#123", () => {
		const room = MercuryRoom.create(id, "lp12000,t#123", logger, emitter);
		expect(room.hostInfo.startLp).toBe(12000);
		expect(room.hostInfo.mode).toBe(Mode.TAG);
	});

	it("Should create a room with Match mode and duel rule 2  if command is mr2,m#123", () => {
		const room = MercuryRoom.create(id, "mr2,m#123", logger, emitter);
		expect(room.hostInfo.duelRule).toBe(2);
		expect(room.hostInfo.mode).toBe(Mode.MATCH);
	});

	it("Should create a single match room, allowing all cards from TCG and OCG (But the Forbidden/Limited List is still OCG's) sending rule 5 if command contains ot", () => {
		const room = MercuryRoom.create(id, "ot#123", logger, emitter);
		expect(room.hostInfo.rule).toBe(5);
	});

	it("Should create a tag room, allowing all cards from TCG and OCG, with a life point total of 36000.", () => {
		const room = MercuryRoom.create(id, "T,OT,LP36000#123", logger, emitter);
		expect(room.hostInfo.rule).toBe(5);
		expect(room.hostInfo.startLp).toBe(36000);
		expect(room.hostInfo.mode).toBe(Mode.TAG);
	});
});
