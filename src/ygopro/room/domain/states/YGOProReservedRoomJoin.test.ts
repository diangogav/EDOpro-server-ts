/**
 * Seat reservation at the JOIN door of every non-waiting state.
 *
 * A matchmaking room's join string travels through client config and process
 * lists, so it must not be enough to take a seat once the duel is underway:
 * a non-watch third party is explicitly rejected — not seated, not spectator —
 * while a reserved player's own reconnect keeps working and a watch-stamped
 * socket ("w,<roomId>") is admitted to the stands only. States are exercised on
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
const makeSeatedPlayer = (
	name = "Jaden",
	socket?: { closed: boolean; remoteAddress: string | undefined },
): YGOProClient => {
	const client = Object.create(YGOProClient.prototype) as Record<string, unknown>;
	client._credential = null;
	client.name = name;
	client.sendMessageToClient = jest.fn();
	client.clearReconnecting = jest.fn();
	if (socket) {
		client._socket = socket;
	}
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

// Watch joins ("w,<roomId>") reach these states carrying a server-side watch
// stamp on the socket. The reservation gate still runs first: a stamp for
// THIS room is admitted (stands only), any other socket the reservation does
// not admit is rejected. In an unreserved room the stamp forces the
// spectator branch.
describe("mid-duel states — watch-marked joiners", () => {
	const buildDueling = (room: jest.Mocked<YGOProRoom>) => buildState(YGOProDuelingState, { room });

	it("rejects a watch-marked third party when the reservation does not admit it", () => {
		const room = makeRoom();
		(room.reservationAdmits as jest.Mock).mockReturnValue(false);
		const socket = makeSocket({ watchForRoomId: 99 });

		buildDueling(room).handleJoin(makeJoinMessage(), room, socket);

		expectRejected(room, socket);
	});

	it("spectates a watch-marked joiner in an unreserved dueling room (existing fallback path)", () => {
		const room = makeRoom();
		const socket = makeSocket({ watchForRoomId: 99 });

		buildDueling(room).handleJoin(makeJoinMessage(), room, socket);

		expectSpectated(room);
	});

	it("spectates a watch-marked joiner in an unreserved RPS room (existing fallback path)", () => {
		const room = makeRoom();
		const socket = makeSocket({ watchForRoomId: 99 });

		buildState(YGOProRockPaperScissorState).handleJoin(makeJoinMessage(), room, socket);

		expectSpectated(room);
	});
});

// The watch stamp's contract in every mid-duel state: a "w,<roomId>" joiner
// asked to spectate, never to take a seat. Even when its nickname matches a
// reconnect-eligible player, the JOIN must land in the stands and the seated
// player's connection must stay untouched. A stamp for a DIFFERENT room is
// inert — never cleared, so a stale stamp must not leak across rooms.
describe("mid-duel states — watch stamp never takes a seat", () => {
	const ROOM_ID = 7;

	const stateBuilders: ReadonlyArray<
		[string, (room: jest.Mocked<YGOProRoom>) => JoinCapableState]
	> = [
		["YGOProDuelingState", (room) => buildState(YGOProDuelingState, { room })],
		[
			"YGOProRockPaperScissorState",
			() => buildState(YGOProRockPaperScissorState, { handResult: [0, 0] }),
		],
		["YGOProChoosingOrderState", () => buildState(YGOProChoosingOrderState)],
		["YGOProSideDeckingState", () => buildState(YGOProSideDeckingState)],
	];

	const expectSeatUntouched = (room: jest.Mocked<YGOProRoom>, victim: YGOProClient): void => {
		expectSpectated(room);
		expect(room.reconnect).not.toHaveBeenCalled();
		expect(victim.sendMessageToClient).not.toHaveBeenCalled();
	};

	it.each(
		stateBuilders,
	)("%s: a watch-marked joiner matching a DISCONNECTED player in a casual room lands in the stands", (_name, build) => {
		// Casual reconnect eligibility: same name, same remote address, socket
		// already closed — the strongest legitimate-looking claim on the seat.
		const victim = makeSeatedPlayer("Jaden", { closed: true, remoteAddress: "127.0.0.1" });
		const room = makeRoom({ id: ROOM_ID, ranked: false, players: [victim] });
		const socket = makeSocket({ watchForRoomId: ROOM_ID });

		build(room).handleJoin(makeJoinMessage(), room, socket);

		expectSeatUntouched(room, victim);
	});

	it.each(
		stateBuilders,
	)("%s: a watch-marked joiner matching a STILL-CONNECTED player in a ranked room lands in the stands", (_name, build) => {
		// Ranked rooms (incl. external leagues) skip the address and liveness
		// checks, so without the stamp this name match would take over the
		// victim's live seat.
		const victim = makeSeatedPlayer("Jaden", { closed: false, remoteAddress: "9.9.9.9" });
		const room = makeRoom({ id: ROOM_ID, ranked: true, players: [victim] });
		const socket = makeSocket({ watchForRoomId: ROOM_ID });

		build(room).handleJoin(makeJoinMessage(), room, socket);

		expectSeatUntouched(room, victim);
	});

	it.each(
		stateBuilders,
	)("%s: a genuine (non-watch) by-name reconnect still reaches the seat", (_name, build) => {
		const victim = makeSeatedPlayer("Jaden");
		const room = makeRoom({ id: ROOM_ID, ranked: true, players: [victim] });
		const socket = makeSocket();

		build(room).handleJoin(makeJoinMessage(), room, socket);

		expect(room.reconnect).toHaveBeenCalledWith(victim, socket);
		expect(room.createSpectatorUnsafe).not.toHaveBeenCalled();
	});

	it("a stale stamp for ANOTHER room does not suppress the reconnect", () => {
		const victim = makeSeatedPlayer("Jaden");
		const room = makeRoom({ id: ROOM_ID, ranked: true, players: [victim] });
		const socket = makeSocket({ watchForRoomId: ROOM_ID + 1 });

		buildState(YGOProDuelingState, { room }).handleJoin(makeJoinMessage(), room, socket);

		expect(room.reconnect).toHaveBeenCalledWith(victim, socket);
		expect(room.createSpectatorUnsafe).not.toHaveBeenCalled();
	});
});

// Reserved-room spectating through the REAL reservation gate: a watch stamp
// for THIS room is spectate-only capability, so it passes the JOIN door and
// lands in the stands, while every non-watch third party stays fully
// rejected — no seat, no stands.
describe("mid-duel states — watch spectating a RESERVED room (real gate)", () => {
	const ROOM_ID = 7;

	const makeReservedRoom = (): jest.Mocked<YGOProRoom> => {
		const room = makeRoom({ id: ROOM_ID, reservedUserIds: ["u-a", "u-b"] });
		room.reservationAdmits = YGOProRoom.prototype.reservationAdmits.bind(
			room,
		) as typeof room.reservationAdmits;
		return room;
	};

	it("spectates a watch-stamped joiner in a reserved DUELING room without touching seats", () => {
		const room = makeReservedRoom();
		const socket = makeSocket({ watchForRoomId: ROOM_ID });

		buildState(YGOProDuelingState, { room }).handleJoin(makeJoinMessage(), room, socket);

		expectSpectated(room);
		expect(room.reconnect).not.toHaveBeenCalled();
	});

	it("spectates a watch-stamped joiner in a reserved RPS room", () => {
		const room = makeReservedRoom();
		const socket = makeSocket({ watchForRoomId: ROOM_ID });

		buildState(YGOProRockPaperScissorState, { handResult: [0, 0] }).handleJoin(
			makeJoinMessage(),
			room,
			socket,
		);

		expectSpectated(room);
		expect(room.reconnect).not.toHaveBeenCalled();
	});

	it("still fully rejects a ticketed non-reserved third party", () => {
		const room = makeReservedRoom();
		const socket = makeSocket({ resolvedUserId: "u-intruder" });

		buildState(YGOProDuelingState, { room }).handleJoin(makeJoinMessage(), room, socket);

		expectRejected(room, socket);
	});

	it("still fully rejects an anonymous guest third party", () => {
		const room = makeReservedRoom();
		const socket = makeSocket();

		buildState(YGOProDuelingState, { room }).handleJoin(makeJoinMessage(), room, socket);

		expectRejected(room, socket);
	});
});
