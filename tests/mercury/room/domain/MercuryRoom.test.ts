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

	it("Should create room with timelimit of 300 segs (for values between 1 and 60 should be covert to seconds)  if the command is tm5#123", () => {
		const room = MercuryRoom.create(id, "tm5#123", logger, emitter);
		expect(room.hostInfo.timeLimit).toBe(300);
		expect(room.hostInfo.startLp).toBe(8000);
	});

	it("Should create room with timelimit of 500 segs if the command is tm500#123", () => {
		const room = MercuryRoom.create(id, "tm500#123", logger, emitter);
		expect(room.hostInfo.timeLimit).toBe(500);
		expect(room.hostInfo.startLp).toBe(8000);
	});

	it("Should create room with timelimit passed by param if the param is greater than 60 and lowerthan 999 , for example: tm1200#123", () => {
		const room = MercuryRoom.create(id, "tm200#123", logger, emitter);
		expect(room.hostInfo.timeLimit).toBe(200);
		expect(room.hostInfo.startLp).toBe(8000);
	});

	it("Should create a room with the default timelimit if time command if not sent correctly", () => {
		const room = MercuryRoom.create(id, "tm#123", logger, emitter);
		expect(room.hostInfo.timeLimit).toBe(180);
		expect(room.hostInfo.startLp).toBe(8000);
	});

	it("Should create a tag room with time params correcty", () => {
		const room = MercuryRoom.create(id, "t,tm200#123", logger, emitter);
		expect(room.hostInfo.timeLimit).toBe(200);
		expect(room.hostInfo.startLp).toBe(16000);
		expect(room.hostInfo.mode).toBe(Mode.TAG);
	});

	it("Should create a room without deck shuffling if ns param is send", () => {
		const room = MercuryRoom.create(id, "m,ns#123", logger, emitter);
		expect(room.hostInfo.noShuffle).toBe(true);
	});

	it("Should create a room with deck shuffling if ns param is not send", () => {
		const room = MercuryRoom.create(id, "mr2,m#123", logger, emitter);
		expect(room.hostInfo.noShuffle).toBe(false);
	});

	it("Should create a room without deck checking if nc param is send", () => {
		const room = MercuryRoom.create(id, "m,nc#123", logger, emitter);
		expect(room.hostInfo.noCheck).toBe(true);
	});

	it("Should create a room with deck checking if nc param is not send", () => {
		const room = MercuryRoom.create(id, "mr2,m#123", logger, emitter);
		expect(room.hostInfo.noCheck).toBe(false);
	});

	it("Should create a room with deck count 1 if dr param is not send", () => {
		const room = MercuryRoom.create(id, "mr2,m#123", logger, emitter);
		expect(room.hostInfo.drawCount).toBe(1);
	});

	it("Should create a room with deck count passed by params if dr param is send", () => {
		const room = MercuryRoom.create(id, "mr2,m,dr9#123", logger, emitter);
		expect(room.hostInfo.drawCount).toBe(9);
	});

	it("Should create a room with deck count 35 if dr param value is greater than 35", () => {
		const room = MercuryRoom.create(id, "mr2,m,dr40#123", logger, emitter);
		expect(room.hostInfo.drawCount).toBe(35);
	});

	it("Should create a room with deck count 1 if dr param value is invalid", () => {
		const room = MercuryRoom.create(id, "mr2,m,dr#123", logger, emitter);
		expect(room.hostInfo.drawCount).toBe(1);
	});

	it("Should create a room with start hand count  1 if st param is not send", () => {
		const room = MercuryRoom.create(id, "mr2,m#123", logger, emitter);
		expect(room.hostInfo.startHand).toBe(5);
	});

	it("Should create a room with start hand count passed by params if st param is send", () => {
		const room = MercuryRoom.create(id, "mr2,m,st10#123", logger, emitter);
		expect(room.hostInfo.startHand).toBe(10);
	});

	it("Should create a room with start hand count 40 if st param value is greater than 40", () => {
		const room = MercuryRoom.create(id, "mr2,m,st50#123", logger, emitter);
		expect(room.hostInfo.startHand).toBe(40);
	});

	it("Should create a room with start hand count 5 if st param value is invalid", () => {
		const room = MercuryRoom.create(id, "mr2,m,stundefined#123", logger, emitter);
		expect(room.hostInfo.startHand).toBe(5);
	});

	it("Should create a room with start hand count 5 if st param value is lower than zero", () => {
		const room = MercuryRoom.create(id, "mr2,m,st0#123", logger, emitter);
		expect(room.hostInfo.startHand).toBe(5);
	});
});
