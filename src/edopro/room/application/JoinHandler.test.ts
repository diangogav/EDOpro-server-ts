import { EventEmitter } from "stream";

import { Logger } from "@shared/logger/domain/Logger";
import { Commands } from "@shared/messages/Commands";
import { ClientMessage } from "@shared/messages/MessageProcessor";
import { ISocket } from "@shared/socket/domain/ISocket";
import { CheckIfUseCanJoin } from "@shared/user-auth/application/CheckIfUserCanJoin";

import { createMatchmakingRoom } from "@ygopro/matchmaking/application/MatchmakingRoomFactory";
import YGOProRoomList from "@ygopro/room/infrastructure/YGOProRoomList";

import { ChatColor, ErrorMessageType, YGOProStocChat } from "ygopro-msg-encode";

import { JoinHandler } from "./JoinHandler";

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
		id: "sock-edopro",
		remoteAddress: "10.0.0.9",
		closed: false,
		send: jest.fn(),
		close: jest.fn(),
		destroy: jest.fn(),
		onMessage: jest.fn(),
		removeAllListeners: jest.fn(),
	}) as unknown as jest.Mocked<ISocket>;

// CTOS_JOIN_GAME as the edopro flavor parses it (JoinGameMessage): version at
// 0-2, room id at 4-8, password utf16 at 8-48. The version doubles as the
// ygopro YGOProJoinGameMessage.version once the JOIN is forwarded into the
// room's state machine, so it carries mercuryConfig.version (4962) to get past
// the version gate and reach the reservation gate under test.
const makeJoinGameData = (roomId: number, password: string): Buffer => {
	const data = Buffer.alloc(50);
	data.writeUInt16LE(4962, 0);
	data.writeUInt32LE(roomId, 4);
	data.write(password, 8, "utf16le");
	return data;
};

// "Mallory" in UTF-16LE, no PIN separator (the edopro PlayerInfo frame).
const makePlayerInfoData = (): Buffer => {
	const data = Buffer.alloc(40);
	data.write("Mallory", 0, "utf16le");
	return data;
};

const makeJoinMessage = (roomId: number, password: string): ClientMessage =>
	({
		data: makeJoinGameData(roomId, password),
		previousMessage: makePlayerInfoData(),
	}) as unknown as ClientMessage;

const clearRooms = () => {
	const rooms = YGOProRoomList.getRooms();
	while (rooms.length) {
		YGOProRoomList.deleteRoom(rooms[0]);
	}
};

const flush = () => new Promise((resolve) => setImmediate(resolve));

describe("JoinHandler — cross-flavor join into a reserved ygopro matchmaking room", () => {
	beforeEach(clearRooms);
	afterEach(clearRooms);

	// The edopro JoinHandler resolves ygopro rooms by id too, so an edopro
	// client holding the leaked join credentials can knock on a matchmaking
	// room's door. Its socket never went through the ticket handshake — no
	// resolvedUserId — so the reservation gate must turn it away entirely:
	// not seated, not spectator.
	it("rejects an edopro-flavor socket presenting the correct password (no ticket identity)", async () => {
		const { room, roomPassword } = createMatchmakingRoom({
			rankedOverride: true,
			matchMode: true,
			reservedUserIds: ["u-a", "u-b"],
			logger: makeLogger(),
			emitter: new EventEmitter(),
		});
		const password = roomPassword.split("#")[1];

		const emitter = new EventEmitter();
		const socket = makeSocket();
		const checkIfUseCanJoin = {
			check: jest.fn().mockResolvedValue(true),
		} as unknown as CheckIfUseCanJoin;
		new JoinHandler(emitter, makeLogger(), socket, checkIfUseCanJoin);

		emitter.emit(Commands.JOIN_GAME as unknown as string, makeJoinMessage(room.id, password));
		await flush();

		// Turned away at the reservation gate with the ygopro reject sequence.
		const sentBuffers = (socket.send as jest.Mock).mock.calls.map(([buf]) => buf as Buffer);
		const expectedChat = Buffer.from(
			new YGOProStocChat()
				.fromPartial({
					player_type: ChatColor.RED,
					msg: "This room is reserved for its matched players.",
				})
				.toFullPayload(),
		);
		expect(sentBuffers.some((buf) => buf.equals(expectedChat))).toBe(true);
		expect(sentBuffers).toContainEqual(
			room.messageSender.errorMessage(ErrorMessageType.JOINERROR, 0),
		);
		expect(socket.close).toHaveBeenCalled();

		// Not seated, not spectator; the room survives untouched for its pair.
		expect(room.playersCount).toBe(0);
		expect(room.spectators).toHaveLength(0);
		expect(YGOProRoomList.findById(room.id)).toBe(room);
	});
});
