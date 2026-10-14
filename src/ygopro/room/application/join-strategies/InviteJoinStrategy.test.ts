import { EventEmitter } from "stream";
import { mock } from "jest-mock-extended";
import { ISocket } from "@shared/socket/domain/ISocket";
import { YGOProRoomMother } from "@test-support/mothers/room/YGOProRoomMother";
import { MessageRepositoryMock } from "@test-support/mocks/MessageRepositoryMock";
import { LoggerMock } from "@test-support/mocks/logger/LoggerMock";
import { JoinContext } from "./JoinStrategy";
import { InviteJoinStrategy } from "./InviteJoinStrategy";
import { composeJoinStrategies } from "./composeJoinStrategies";
import { JoinStrategyRegistry } from "./JoinStrategyRegistry";
import YGOProRoomList from "../../infrastructure/YGOProRoomList";

jest.mock("@ygopro/SimpleRoomMessageEmitter");

const makeCtx = (command: string, password = ""): JoinContext =>
	({
		command,
		password,
		rawPass: command + (password ? "#" + password : ""),
		playerInfo: { name: "Invited", password: "", previousMessage: Buffer.alloc(0) },
		socket: mock<ISocket>({ id: "invite-socket", closed: false, resolvedUserId: "user" }),
		socketId: "invite-socket",
		eventEmitter: new EventEmitter(),
		messageRepository: new MessageRepositoryMock(),
		logger: new LoggerMock(),
		message: { data: Buffer.alloc(48), previousMessage: Buffer.alloc(0) },
	}) as unknown as JoinContext;

describe("InviteJoinStrategy", () => {
	afterEach(() => {
		YGOProRoomList.getRooms().splice(0);
	});
	it.each([
		"j",
		"j,",
		"j,bad",
		"J,broken",
		"j,extra,parts",
	])("reserves malformed invite %j without a room-creation fallback", async (command) => {
		const ctx = makeCtx(command);
		const registry = JoinStrategyRegistry.createForTests(composeJoinStrategies());
		const strategy = registry.resolve(ctx);
		expect(strategy).toBeInstanceOf(InviteJoinStrategy);
		await strategy.handle(ctx);
		expect(ctx.socket.close).toHaveBeenCalled();
		expect(YGOProRoomList.getRooms()).toHaveLength(0);
	});
	it("routes an authenticated invitation to the exact room without bypassing admission", async () => {
		const room = YGOProRoomMother.create({ command: "t,casual,_tag" });
		YGOProRoomList.addRoom(room);
		const emit = jest.spyOn(room, "emit").mockImplementation(() => undefined);
		const ctx = makeCtx("j," + room.inviteId);
		await new InviteJoinStrategy().handle(ctx);
		expect(ctx.socket.inviteForRoomId).toBe(room.id);
		expect(emit).toHaveBeenCalledWith("JOIN", ctx.message, ctx.socket);
		expect(room.players).toHaveLength(0);
	});
	it.each([
		"private",
		"reserved",
		"matchmaking",
		"started",
		"full",
		"password",
	])("rejects %s rooms without spectator fallback", async (kind) => {
		const room = YGOProRoomMother.create({
			command: kind === "private" ? "casual#secret" : "casual",
		});
		YGOProRoomList.addRoom(room);
		if (kind === "reserved") room.reservedUserIds = ["user"];
		if (kind === "matchmaking") room.isMatchmaking = true;
		if (kind === "started") room.rps();
		if (kind === "full") jest.spyOn(room, "hasFreeSeat").mockReturnValue(false);
		const emit = jest.spyOn(room, "emit").mockImplementation(() => undefined);
		const ctx = makeCtx("j," + room.inviteId, kind === "password" ? "secret" : "");
		await new InviteJoinStrategy().handle(ctx);
		expect(emit).not.toHaveBeenCalled();
		expect(ctx.socket.close).toHaveBeenCalled();
	});
	it("never reuses an expired invitation when a numeric room id is recycled", async () => {
		const oldRoom = YGOProRoomMother.create({ id: 42, command: "casual" });
		const replacement = YGOProRoomMother.create({ id: 42, command: "casual" });
		YGOProRoomList.addRoom(replacement);
		const ctx = makeCtx("j," + oldRoom.inviteId);
		await new InviteJoinStrategy().handle(ctx);
		expect(oldRoom.inviteId).not.toBe(replacement.inviteId);
		expect(ctx.socket.close).toHaveBeenCalled();
		expect(YGOProRoomList.getRooms()).toEqual([replacement]);
	});
});
