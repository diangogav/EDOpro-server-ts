import { EventEmitter } from "stream";

import { ChatColor, YGOProStocChat } from "ygopro-msg-encode";

import { Logger } from "@shared/logger/domain/Logger";
import { ClientMessage } from "@shared/messages/MessageProcessor";
import { ISocket } from "@shared/socket/domain/ISocket";
import { CheckIfUseCanJoin } from "@shared/user-auth/application/CheckIfUserCanJoin";

import RoomList from "@edopro/room/infrastructure/RoomList";
import { Room } from "@edopro/room/domain/Room";

import { JoinHandler } from "./JoinHandler";

// Join rejections share one RED STOC_CHAT voice (cause + action) instead of
// the legacy 0xF3 ServerErrorClientMessage frame.

const makeLogger = (): jest.Mocked<Logger> =>
	({
		child: jest.fn().mockReturnThis(),
		info: jest.fn(),
		warn: jest.fn(),
		error: jest.fn(),
		debug: jest.fn(),
	}) as unknown as jest.Mocked<Logger>;

const makeSocket = (): jest.Mocked<ISocket> =>
	({
		id: "sock-1",
		remoteAddress: "10.0.0.1",
		send: jest.fn(),
		destroy: jest.fn(),
	}) as unknown as jest.Mocked<ISocket>;

const makeJoinGameData = (roomId: number, password: string): Buffer => {
	const data = Buffer.alloc(50);
	data.writeUInt32LE(roomId, 4);
	data.write(password, 8, "utf16le");
	return data;
};

const makeJoinMessage = (roomId: number, password: string): ClientMessage =>
	({
		data: makeJoinGameData(roomId, password),
		previousMessage: Buffer.alloc(40),
	}) as unknown as ClientMessage;

const expectedRedFrame = (text: string): Buffer =>
	Buffer.from(
		new YGOProStocChat().fromPartial({ player_type: ChatColor.RED, msg: text }).toFullPayload(),
	);

const clearRooms = (): void => {
	while (RoomList.getRooms().length) {
		// no deleteRoom needed — these fake rooms never touch reconnection state
		RoomList.getRooms().pop();
	}
};

describe("JoinHandler — join rejections (RED STOC_CHAT)", () => {
	afterEach(clearRooms);

	it("rejects an unknown room with 'Room not found — refresh the room list.'", async () => {
		const socket = makeSocket();
		const checkIfUseCanJoin = { check: jest.fn() } as unknown as CheckIfUseCanJoin;
		const handler = new JoinHandler(new EventEmitter(), makeLogger(), socket, checkIfUseCanJoin);

		await handler.handleJoinGame(makeJoinMessage(9999, ""));

		expect(socket.send).toHaveBeenCalledWith(
			expectedRedFrame("Room not found — refresh the room list."),
		);
		expect(socket.destroy).toHaveBeenCalled();
	});

	it("rejects a wrong password with 'Wrong password.'", async () => {
		const socket = makeSocket();
		const room = { id: 42, ranked: false, password: "secret", emit: jest.fn() } as unknown as Room;
		RoomList.addRoom(room);

		const checkIfUseCanJoin = { check: jest.fn() } as unknown as CheckIfUseCanJoin;
		const handler = new JoinHandler(new EventEmitter(), makeLogger(), socket, checkIfUseCanJoin);

		await handler.handleJoinGame(makeJoinMessage(42, "wrong"));

		expect(socket.send).toHaveBeenCalledWith(expectedRedFrame("Wrong password."));
		expect(socket.destroy).toHaveBeenCalled();
		expect(room.emit).not.toHaveBeenCalled();
	});
});
