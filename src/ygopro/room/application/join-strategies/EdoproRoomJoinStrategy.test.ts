import { EventEmitter } from "stream";

import {
	ForeignRoomEntry,
	ForeignRoomEntryResult,
} from "@shared/room/application/ForeignRoomEntry";
import { ISocket } from "@shared/socket/domain/ISocket";

import { EdoproRoomJoinStrategy } from "./EdoproRoomJoinStrategy";
import { JoinContext } from "./JoinStrategy";

const makeSocket = (): jest.Mocked<ISocket> =>
	({
		id: "sock-edo",
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
		socketId: "sock-edo",
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

const entryReturning = (result: ForeignRoomEntryResult): jest.Mocked<ForeignRoomEntry> => ({
	enter: jest.fn().mockReturnValue(result),
});

const ALLOWED = new Set(["evoduel"]);

describe("EdoproRoomJoinStrategy", () => {
	it.each(["edo,1234", " EDO , 1234 ", "edo,1234#secret"])("matches %p", (rawPass) => {
		expect(
			new EdoproRoomJoinStrategy(entryReturning("joined"), ALLOWED).matches(makeCtx(rawPass)),
		).toBe(true);
	});

	it.each([
		"edo",
		"edo,",
		"edo,12a",
		"edo,1,2",
		"w,1234",
		"tcg,edo",
		"1234",
	])("leaves %p to the rest of the chain", (rawPass) => {
		expect(
			new EdoproRoomJoinStrategy(entryReturning("joined"), ALLOWED).matches(makeCtx(rawPass)),
		).toBe(false);
	});

	it("hands the EDOPro room a bridged socket with the parsed id and password", async () => {
		const entry = entryReturning("joined");
		const ctx = makeCtx("edo,1234#secret");

		await new EdoproRoomJoinStrategy(entry, ALLOWED).handle(ctx);

		expect(entry.enter).toHaveBeenCalledWith(
			expect.objectContaining({ roomId: 1234, password: "secret", message: ctx.message }),
		);
		expect(entry.enter.mock.calls[0][0].socket.id).toBe("sock-edo");
		expect(ctx.socket.send).not.toHaveBeenCalled();
		expect(ctx.socket.close).not.toHaveBeenCalled();
	});

	it.each<ForeignRoomEntryResult>([
		"not-found",
		"wrong-password",
		"login-required",
		"unsupported",
	])("rejects with a reason and JOINERROR when the entry answers %p", async (result) => {
		const ctx = makeCtx("edo,1234");

		await new EdoproRoomJoinStrategy(entryReturning(result), ALLOWED).handle(ctx);

		expect(ctx.socket.send).toHaveBeenCalledTimes(2);
		expect(ctx.socket.send).toHaveBeenLastCalledWith(Buffer.from("join-error"));
		expect(ctx.socket.close).toHaveBeenCalledTimes(1);
	});

	it.each([
		undefined,
		"mdpro4",
		"",
	])("turns away a client that did not declare itself ready for EDOPro rooms (%p)", async (clientName) => {
		const entry = entryReturning("joined");
		const ctx = makeCtx("edo,1234");
		ctx.socket.clientName = clientName;

		await new EdoproRoomJoinStrategy(entry, ALLOWED).handle(ctx);

		expect(entry.enter).not.toHaveBeenCalled();
		expect(ctx.socket.send).toHaveBeenLastCalledWith(Buffer.from("join-error"));
		expect(ctx.socket.close).toHaveBeenCalledTimes(1);
	});

	it("reads the client name without regard to case", async () => {
		const entry = entryReturning("joined");
		const ctx = makeCtx("edo,1234");
		ctx.socket.clientName = "EvoDuel";

		await new EdoproRoomJoinStrategy(entry, ALLOWED).handle(ctx);

		expect(entry.enter).toHaveBeenCalledTimes(1);
	});
});
