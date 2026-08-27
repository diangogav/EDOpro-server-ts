/**
 * Seat reservation at the JOIN door of every non-waiting state.
 *
 * A matchmaking room's join string travels through client config and process
 * lists, so it must not be enough to enter the room once the duel is underway:
 * a third party is explicitly rejected — not seated, not spectator — while a
 * reserved player's own reconnect keeps working. States are exercised on
 * prototype instances (same approach as the express-reconnect tests) because
 * the dueling state's full constructor needs an OCGCore spin-up.
 */

import { Logger } from "@shared/logger/domain/Logger";
import { ClientMessage } from "@shared/messages/MessageProcessor";
import { TokenIndex } from "@shared/room/domain/TokenIndex";
import { ISocket } from "@shared/socket/domain/ISocket";

import { YGOProClient } from "../../../client/domain/YGOProClient";
import { YGOProRoom } from "../YGOProRoom";
import { YGOProChoosingOrderState } from "./YGOProChoosingOrderState";
import { YGOProDuelingState } from "./YGOProDuelingState";
import { YGOProRockPaperScissorState } from "./YGOProRockPaperScissorState";
import { YGOProSideDeckingState } from "./YGOProSideDeckingState";

const makeLogger = (): jest.Mocked<Logger> =>
	({
		child: jest.fn().mockReturnThis(),
		info: jest.fn(),
		warn: jest.fn(),
		error: jest.fn(),
		debug: jest.fn(),
	}) as unknown as jest.Mocked<Logger>;

// "Jaden" in UTF-16LE with no password separator (40 bytes)
const PLAYER_INFO_HEX =
	"4a006100640065006e00000000000000000000000000000000000000000000000000000000000000";

const makeJoinMessage = (): ClientMessage =>
	({
		data: Buffer.alloc(48),
		previousMessage: Buffer.from(PLAYER_INFO_HEX, "hex"),
	}) as unknown as ClientMessage;

const makeSocket = (overrides: Partial<ISocket> = {}): jest.Mocked<ISocket> =>
	({
		send: jest.fn(),
		close: jest.fn(),
		destroy: jest.fn(),
		remoteAddress: "127.0.0.1",
		closed: false,
		...overrides,
	}) as unknown as jest.Mocked<ISocket>;

const makeSpectator = () =>
	({ sendMessageToClient: jest.fn() }) as unknown as jest.Mocked<YGOProClient>;

const makeRoom = (overrides: Record<string, unknown> = {}): jest.Mocked<YGOProRoom> =>
	({
		ranked: true,
		players: [],
		reservationAdmits: jest.fn().mockReturnValue(true),
		rejectReservedJoin: jest.fn(),
		createSpectatorUnsafe: jest.fn().mockReturnValue(makeSpectator()),
		addSpectatorUnsafe: jest.fn(),
		reconnect: jest.fn(),
		sendDeckCountMessage: jest.fn(),
		sendPreviousDuelsHistoricalMessages: jest.fn(),
		sendCurrentDuelHistoricalMessages: jest.fn(),
		messageSender: {
			duelStartMessage: jest.fn().mockReturnValue(Buffer.from("duel-start")),
			changeSideMessage: jest.fn().mockReturnValue(Buffer.from("change-side")),
		},
		...overrides,
	}) as unknown as jest.Mocked<YGOProRoom>;

// A YGOProClient instance (passes `instanceof YGOProClient`) without running
// the real constructor. A weak-auth seat with a matching name so
// findReconnectingPlayer resolves it in a ranked room.
const makeSeatedPlayer = (name = "Jaden"): YGOProClient => {
	const client = Object.create(YGOProClient.prototype) as Record<string, unknown>;
	client._credential = null;
	client.name = name;
	client.sendMessageToClient = jest.fn();
	return client as unknown as YGOProClient;
};

type JoinCapableState = {
	handleJoin(message: ClientMessage, room: YGOProRoom, socket: ISocket): void;
};

const buildState = (
	proto: { prototype: object },
	fields: Record<string, unknown> = {},
): JoinCapableState => {
	const state = Object.create(proto.prototype);
	Object.assign(state, { logger: makeLogger(), ...fields });
	return state as JoinCapableState;
};

const expectRejected = (room: jest.Mocked<YGOProRoom>, socket: jest.Mocked<ISocket>): void => {
	expect(room.rejectReservedJoin).toHaveBeenCalledWith(socket);
	expect(room.createSpectatorUnsafe).not.toHaveBeenCalled();
	expect(room.addSpectatorUnsafe).not.toHaveBeenCalled();
	expect(room.reconnect).not.toHaveBeenCalled();
};

const expectSpectated = (room: jest.Mocked<YGOProRoom>): void => {
	expect(room.rejectReservedJoin).not.toHaveBeenCalled();
	expect(room.createSpectatorUnsafe).toHaveBeenCalled();
	expect(room.addSpectatorUnsafe).toHaveBeenCalled();
};

describe("YGOProDuelingState.handleJoin — reserved rooms", () => {
	const build = (room: jest.Mocked<YGOProRoom>) => buildState(YGOProDuelingState, { room });

	it("rejects a third party the reservation does not admit — not even as spectator", () => {
		const room = makeRoom();
		(room.reservationAdmits as jest.Mock).mockReturnValue(false);
		const socket = makeSocket({ resolvedUserId: "u-intruder" });

		build(room).handleJoin(makeJoinMessage(), room, socket);

		expectRejected(room, socket);
	});

	it("still spectates a third party in a room without reservations", () => {
		const room = makeRoom();

		build(room).handleJoin(makeJoinMessage(), room, makeSocket());

		expectSpectated(room);
	});

	it("still reconnects a seated player the reservation admits", () => {
		const player = makeSeatedPlayer();
		const room = makeRoom({ players: [player] });
		const socket = makeSocket({ resolvedUserId: "u-a" });

		build(room).handleJoin(makeJoinMessage(), room, socket);

		expect(room.reconnect).toHaveBeenCalledWith(player, socket);
		expect(room.rejectReservedJoin).not.toHaveBeenCalled();
	});

	it("still reconnects a reserved player through its token (EXPRESS_RECONNECT bypasses the JOIN gate)", async () => {
		// The reconnection token is itself proof of a prior admitted seat, so the
		// reservation gate never inspects that path — a fresh socket without a
		// resolved identity must get back into the reserved duel.
		const player = Object.create(YGOProClient.prototype) as Record<string, unknown>;
		player._reconnectionToken = "tok";
		player.sendMessageToClient = jest.fn();
		player.setReconnectionToken = jest.fn();
		player.clearReconnecting = jest.fn();
		TokenIndex.getInstance().register("tok", player as unknown as YGOProClient, 1);

		const room = makeRoom({ id: 1, reservedUserIds: ["u-a", "u-b"] });
		const socket = makeSocket();
		const ocgCore = {
			sendStartMessageForReconnect: jest.fn(),
			sendTurnMessages: jest.fn(),
			sendPhaseMessage: jest.fn(),
			sendRequestFieldMessage: jest.fn().mockResolvedValue(undefined),
			sendRefreshZonesMessages: jest.fn().mockResolvedValue(undefined),
			sendDeckReversedAndTopMessages: jest.fn().mockResolvedValue(undefined),
			sendReconnectTimeLimitAndResponseState: jest.fn().mockResolvedValue(undefined),
		};
		const state = buildState(YGOProDuelingState, { room, ocgCore }) as unknown as {
			handleExpressReconnect(
				message: ClientMessage,
				room: YGOProRoom,
				socket: ISocket,
			): Promise<void>;
		};

		await state.handleExpressReconnect(
			{ data: Buffer.from("tok", "utf8") } as ClientMessage,
			room,
			socket,
		);

		expect(room.reconnect).toHaveBeenCalledWith(player, socket);
		expect(socket.destroy).not.toHaveBeenCalled();
		TokenIndex.getInstance().clear();
	});
});

describe("YGOProRockPaperScissorState.handleJoin — reserved rooms", () => {
	const build = () => buildState(YGOProRockPaperScissorState, { handResult: [0, 0] });

	it("rejects a third party the reservation does not admit", () => {
		const room = makeRoom();
		(room.reservationAdmits as jest.Mock).mockReturnValue(false);
		const socket = makeSocket();

		build().handleJoin(makeJoinMessage(), room, socket);

		expectRejected(room, socket);
	});

	it("still spectates a third party in a room without reservations", () => {
		const room = makeRoom();

		build().handleJoin(makeJoinMessage(), room, makeSocket());

		expectSpectated(room);
	});
});

describe("YGOProChoosingOrderState.handleJoin — reserved rooms", () => {
	it("rejects a third party the reservation does not admit", () => {
		const room = makeRoom();
		(room.reservationAdmits as jest.Mock).mockReturnValue(false);
		const socket = makeSocket();

		buildState(YGOProChoosingOrderState).handleJoin(makeJoinMessage(), room, socket);

		expectRejected(room, socket);
	});

	it("still spectates a third party in a room without reservations", () => {
		const room = makeRoom();

		buildState(YGOProChoosingOrderState).handleJoin(makeJoinMessage(), room, makeSocket());

		expectSpectated(room);
	});
});

describe("YGOProSideDeckingState.handleJoin — reserved rooms", () => {
	it("rejects a third party the reservation does not admit", () => {
		const room = makeRoom();
		(room.reservationAdmits as jest.Mock).mockReturnValue(false);
		const socket = makeSocket();

		buildState(YGOProSideDeckingState).handleJoin(makeJoinMessage(), room, socket);

		expectRejected(room, socket);
	});

	it("still spectates a third party in a room without reservations", () => {
		const room = makeRoom();

		buildState(YGOProSideDeckingState).handleJoin(makeJoinMessage(), room, makeSocket());

		expectSpectated(room);
	});
});
