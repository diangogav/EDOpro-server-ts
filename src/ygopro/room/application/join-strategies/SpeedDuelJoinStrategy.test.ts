import { EventEmitter } from "stream";

import {
	ForeignSpeedDuelEntryResult,
	ForeignSpeedDuelRooms,
} from "@shared/room/application/ForeignSpeedDuelRooms";
import { ISocket } from "@shared/socket/domain/ISocket";

import { JoinContext } from "./JoinStrategy";
import { SpeedDuelJoinStrategy } from "./SpeedDuelJoinStrategy";

const makeSocket = (): jest.Mocked<ISocket> =>
	({
		id: "sock-speed",
		clientName: "evoduel",
		send: jest.fn(),
		close: jest.fn(),
		destroy: jest.fn(),
	}) as unknown as jest.Mocked<ISocket>;

const makeCtx = (rawPass: string): JoinContext => {
	const [command, password = ""] = rawPass.split("#");

	return {
		rawPass,
		command,
		password,
		playerInfo: { name: "Friend", password: null, hasMercurySignature: false },
		socket: makeSocket(),
		socketId: "sock-speed",
		eventEmitter: new EventEmitter(),
		messageRepository: { errorMessage: jest.fn().mockReturnValue(Buffer.from("join-error")) },
		logger: {
			child: jest.fn().mockReturnThis(),
			info: jest.fn(),
			warn: jest.fn(),
			error: jest.fn(),
			debug: jest.fn(),
		},
		message: { data: Buffer.alloc(48), previousMessage: Buffer.alloc(40) },
	} as unknown as JoinContext;
};

const roomsReturning = (
	result: ForeignSpeedDuelEntryResult,
): jest.Mocked<ForeignSpeedDuelRooms> => ({
	enter: jest.fn().mockReturnValue(result),
});

const ALLOWED = new Set(["evoduel"]);

describe("SpeedDuelJoinStrategy", () => {
	it.each([
		"speed",
		"SPEED",
		" Speed ,casual",
		"m,speed,casual",
		"speed#secret",
		"lp8000,st5,speed",
		"speed,ai",
	])("matches %p", (rawPass) => {
		expect(
			new SpeedDuelJoinStrategy(roomsReturning("joined"), ALLOWED).matches(makeCtx(rawPass)),
		).toBe(true);
	});

	it.each([
		"",
		"tcg",
		"speedy",
		"speed duel",
		"edison,casual",
		"edo,1234",
		"room#speed",
	])("leaves %p to the rest of the chain", (rawPass) => {
		expect(
			new SpeedDuelJoinStrategy(roomsReturning("joined"), ALLOWED).matches(makeCtx(rawPass)),
		).toBe(false);
	});

	it("asks for the room by the exact command and password, on a bridged socket", async () => {
		const rooms = roomsReturning("joined");
		const ctx = makeCtx("Speed,casual#secret");

		await new SpeedDuelJoinStrategy(rooms, ALLOWED).handle(ctx);

		expect(rooms.enter).toHaveBeenCalledWith(
			expect.objectContaining({
				name: "Speed,casual",
				password: "secret",
				bestOf: 1,
				message: ctx.message,
			}),
		);
		expect(rooms.enter.mock.calls[0][0].socket.id).toBe("sock-speed");
		expect(rooms.enter.mock.calls[0][0].socket).not.toBe(ctx.socket);
		expect(ctx.socket.send).not.toHaveBeenCalled();
		expect(ctx.socket.close).not.toHaveBeenCalled();
	});

	it.each(["m,speed", "speed,MATCH"])("asks for a best of 3 for %p", async (rawPass) => {
		const rooms = roomsReturning("joined");

		await new SpeedDuelJoinStrategy(rooms, ALLOWED).handle(makeCtx(rawPass));

		expect(rooms.enter.mock.calls[0][0].bestOf).toBe(3);
	});

	it("asks for nothing else, whatever rule tokens the command carries", async () => {
		const rooms = roomsReturning("joined");
		const ctx = makeCtx("lp8000,st5,dr2,tm3,mr1,t,nc,ns,bo5,speed");

		await new SpeedDuelJoinStrategy(rooms, ALLOWED).handle(ctx);

		expect(rooms.enter.mock.calls[0][0]).toEqual({
			name: "lp8000,st5,dr2,tm3,mr1,t,nc,ns,bo5,speed",
			password: "",
			bestOf: 1,
			message: ctx.message,
			socket: expect.anything(),
		});
	});

	it.each<ForeignSpeedDuelEntryResult>([
		"unavailable",
		"not-found",
		"wrong-password",
		"login-required",
		"unsupported",
	])("rejects with a reason and JOINERROR when the room answers %p", async (result) => {
		const ctx = makeCtx("speed");

		await new SpeedDuelJoinStrategy(roomsReturning(result), ALLOWED).handle(ctx);

		expect(ctx.socket.send).toHaveBeenCalledTimes(2);
		expect(ctx.socket.send).toHaveBeenLastCalledWith(Buffer.from("join-error"));
		expect(ctx.socket.close).toHaveBeenCalledTimes(1);
	});

	it.each([
		undefined,
		"mdpro4",
		"",
	])("turns away a client that did not declare itself ready for EDOPro rooms (%p)", async (clientName) => {
		const rooms = roomsReturning("joined");
		const ctx = makeCtx("speed");
		ctx.socket.clientName = clientName;

		await new SpeedDuelJoinStrategy(rooms, ALLOWED).handle(ctx);

		expect(rooms.enter).not.toHaveBeenCalled();
		expect(ctx.socket.send).toHaveBeenCalledTimes(2);
		expect(ctx.socket.send).toHaveBeenLastCalledWith(Buffer.from("join-error"));
		expect(ctx.socket.close).toHaveBeenCalledTimes(1);
	});

	it("reads the client name without regard to case", async () => {
		const rooms = roomsReturning("joined");
		const ctx = makeCtx("speed");
		ctx.socket.clientName = "EvoDuel";

		await new SpeedDuelJoinStrategy(rooms, ALLOWED).handle(ctx);

		expect(rooms.enter).toHaveBeenCalledTimes(1);
	});

	it("still matches the command and refuses it when the EDOPro flow is not wired", async () => {
		const strategy = new SpeedDuelJoinStrategy(undefined, ALLOWED);
		const ctx = makeCtx("speed,casual");

		expect(strategy.matches(ctx)).toBe(true);
		await strategy.handle(ctx);

		expect(ctx.socket.send).toHaveBeenCalledTimes(2);
		expect(ctx.socket.send).toHaveBeenLastCalledWith(Buffer.from("join-error"));
		expect(ctx.socket.close).toHaveBeenCalledTimes(1);
	});
});
