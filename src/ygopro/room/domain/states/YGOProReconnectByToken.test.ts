import { EventEmitter } from "stream";

import { Commands } from "@shared/messages/Commands";
import { ClientMessage } from "@shared/messages/MessageProcessor";
import { Logger } from "@shared/logger/domain/Logger";
import { ISocket } from "@shared/socket/domain/ISocket";
import { TokenIndex } from "@shared/room/domain/TokenIndex";

import { YGOProClient } from "../../../client/domain/YGOProClient";
import { YGOProRoom } from "../YGOProRoom";
import { YGOProWaitingState } from "./YGOProWaitingState";
import { YGOProDuelingState } from "./YGOProDuelingState";
import { YGOProSideDeckingState } from "./YGOProSideDeckingState";
import { YGOProRockPaperScissorState } from "./YGOProRockPaperScissorState";
import { YGOProChoosingOrderState } from "./YGOProChoosingOrderState";

const SUCCESS_ACK = Buffer.from([0x02, 0x00, 0xfd, 0x00]);
const FAILURE_ACK = Buffer.from([0x02, 0x00, 0xfd, 0x01]);

const HEX32 = /^[0-9a-f]{32}$/;

const makeLogger = (): jest.Mocked<Logger> =>
	({
		child: jest.fn().mockReturnThis(),
		info: jest.fn(),
		warn: jest.fn(),
		error: jest.fn(),
		debug: jest.fn(),
	}) as unknown as jest.Mocked<Logger>;

const reconnectMessage = (token: string): ClientMessage =>
	({ data: Buffer.from(token, "utf8") }) as ClientMessage;

// A YGOProClient instance (passes `instanceof YGOProClient`) without running the
// real constructor (which wires a socket + SimpleRoomMessageEmitter). Backing
// fields are written directly because position/team/isReady/reconnectionToken/
// isCaptain are getter-only on the prototype.
const makeClient = ({
	team = 0,
	isReady = false,
	captain = false,
	token = null as string | null,
} = {}): YGOProClient => {
	const client = Object.create(YGOProClient.prototype) as Record<string, unknown>;
	client._team = team;
	client._position = 0;
	client._isReady = isReady;
	client._captain = captain;
	client._reconnectionToken = token;
	client.name = "P1";
	client.sendMessageToClient = jest.fn();
	client.setReconnectionToken = jest.fn();
	client.clearReconnecting = jest.fn();
	return client as unknown as YGOProClient;
};

beforeEach(() => TokenIndex.getInstance().clear());
afterEach(() => TokenIndex.getInstance().clear());

// ----------------------------------------------------------------------------
// Token issuance at match start (TRY_START in the waiting state).
// ----------------------------------------------------------------------------
describe("YGOProWaitingState — reconnection token issuance at match start", () => {
	let eventEmitter: EventEmitter;
	let host: jest.Mocked<YGOProClient>;
	let guest: jest.Mocked<YGOProClient>;
	let mockRoom: jest.Mocked<YGOProRoom>;

	const buildPlayer = (host: boolean): jest.Mocked<YGOProClient> =>
		({
			host,
			team: host ? 0 : 1,
			logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
			captain: jest.fn(),
			sendMessageToClient: jest.fn(),
			setReconnectionToken: jest.fn(),
		}) as unknown as jest.Mocked<YGOProClient>;

	const makeRoom = (noReconnect: boolean): jest.Mocked<YGOProRoom> =>
		({
			id: 77,
			noReconnect,
			allPlayersReady: true,
			players: [host, guest],
			clients: [host, guest],
			getTeamPlayers: jest.fn((team: number) => [team === 0 ? host : guest]),
			sendDeckCountMessage: jest.fn(),
			createMatch: jest.fn(),
			rps: jest.fn(),
			messageSender: {
				duelStartMessage: jest.fn().mockReturnValue(Buffer.from([0x01, 0x00, 0x05])),
				selectHandMessage: jest.fn().mockReturnValue(Buffer.from([0x01, 0x00, 0x06])),
			},
		}) as unknown as jest.Mocked<YGOProRoom>;

	const emitTryStart = (): void => {
		eventEmitter.emit(
			Commands.TRY_START as unknown as string,
			{ data: Buffer.alloc(0) } as ClientMessage,
			mockRoom,
			host,
		);
	};

	const tokenFramesSentTo = (player: jest.Mocked<YGOProClient>): Buffer[] =>
		(player.sendMessageToClient as jest.Mock).mock.calls
			.map(([frame]: [Buffer]) => frame)
			.filter((frame: Buffer) => frame.length >= 3 && frame.readUInt8(2) === 0xfd);

	beforeEach(() => {
		eventEmitter = new EventEmitter();
		host = buildPlayer(true);
		guest = buildPlayer(false);
		new YGOProWaitingState({} as never, eventEmitter, makeLogger(), {} as never, {} as never);
	});

	it("issues a reconnection token to every player when the match starts", () => {
		mockRoom = makeRoom(false);

		emitTryStart();

		for (const player of [host, guest]) {
			expect(player.setReconnectionToken).toHaveBeenCalledWith(expect.stringMatching(HEX32));
			expect(tokenFramesSentTo(player)).toHaveLength(1);
		}
	});

	it("registers each issued token in the global index against the room", () => {
		mockRoom = makeRoom(false);

		emitTryStart();

		const token = (host.setReconnectionToken as jest.Mock).mock.calls[0][0] as string;
		expect(TokenIndex.getInstance().find(token)).toEqual({
			client: host,
			roomId: 77,
		});
	});

	it("does NOT issue any token for a windbot room (noReconnect)", () => {
		mockRoom = makeRoom(true);

		emitTryStart();

		for (const player of [host, guest]) {
			expect(player.setReconnectionToken).not.toHaveBeenCalled();
			expect(tokenFramesSentTo(player)).toHaveLength(0);
		}
	});
});

// ----------------------------------------------------------------------------
// Express (token) reconnect during the duel.
// ----------------------------------------------------------------------------
describe("YGOProDuelingState.handleExpressReconnect", () => {
	const makeOcgCore = () => ({
		sendStartMessageForReconnect: jest.fn(),
		sendTurnMessages: jest.fn(),
		sendPhaseMessage: jest.fn(),
		sendRequestFieldMessage: jest.fn().mockResolvedValue(undefined),
		sendRefreshZonesMessages: jest.fn().mockResolvedValue(undefined),
		sendDeckReversedAndTopMessages: jest.fn().mockResolvedValue(undefined),
		sendReconnectTimeLimitAndResponseState: jest.fn().mockResolvedValue(undefined),
	});

	const buildState = (ocgCore: object) => {
		const state = Object.create(YGOProDuelingState.prototype);
		Object.assign(state, { logger: makeLogger(), ocgCore });
		return state as {
			handleExpressReconnect(
				message: ClientMessage,
				room: YGOProRoom,
				socket: ISocket,
			): Promise<void>;
		};
	};

	let socket: jest.Mocked<ISocket>;
	let room: jest.Mocked<YGOProRoom>;

	beforeEach(() => {
		socket = { send: jest.fn(), destroy: jest.fn() } as unknown as jest.Mocked<ISocket>;
		room = { id: 1, reconnect: jest.fn() } as unknown as jest.Mocked<YGOProRoom>;
	});

	it("reassociates the socket, replays the board and rotates the token", async () => {
		const player = makeClient({ token: "tok" });
		TokenIndex.getInstance().register("tok", player, 1);
		const ocgCore = makeOcgCore();

		await buildState(ocgCore).handleExpressReconnect(reconnectMessage("tok"), room, socket);

		expect(socket.send).toHaveBeenCalledWith(SUCCESS_ACK);
		expect(room.reconnect).toHaveBeenCalledWith(player, socket);
		// Board re-sync (resyncBoard) was triggered end-to-end.
		expect(ocgCore.sendStartMessageForReconnect).toHaveBeenCalledWith(player);
		expect(ocgCore.sendReconnectTimeLimitAndResponseState).toHaveBeenCalledWith(player);
		// Token rotated: old gone, fresh 32-hex issued.
		expect(TokenIndex.getInstance().find("tok")).toBeUndefined();
		expect(player.setReconnectionToken).toHaveBeenCalledWith(expect.stringMatching(HEX32));
		expect(player.clearReconnecting).toHaveBeenCalled();
	});

	it("rejects an unknown token with a failure ack and destroys the socket", async () => {
		await buildState(makeOcgCore()).handleExpressReconnect(reconnectMessage("ghost"), room, socket);

		expect(socket.send).toHaveBeenCalledWith(FAILURE_ACK);
		expect(socket.destroy).toHaveBeenCalled();
		expect(room.reconnect).not.toHaveBeenCalled();
	});

	it("rejects a token registered to another room", async () => {
		const player = makeClient({ token: "tok" });
		TokenIndex.getInstance().register("tok", player, 999);

		await buildState(makeOcgCore()).handleExpressReconnect(reconnectMessage("tok"), room, socket);

		expect(socket.send).toHaveBeenCalledWith(FAILURE_ACK);
		expect(socket.destroy).toHaveBeenCalled();
	});
});

// ----------------------------------------------------------------------------
// Express (token) reconnect during side decking.
// ----------------------------------------------------------------------------
describe("YGOProSideDeckingState.handleExpressReconnect", () => {
	const buildState = () => {
		const state = Object.create(YGOProSideDeckingState.prototype);
		Object.assign(state, { logger: makeLogger() });
		return state as {
			handleExpressReconnect(message: ClientMessage, room: YGOProRoom, socket: ISocket): void;
		};
	};

	let socket: jest.Mocked<ISocket>;
	let room: jest.Mocked<YGOProRoom>;

	const CHANGE_SIDE = Buffer.from([0x02, 0x00, 0x08]);
	const DUEL_START = Buffer.from([0x01, 0x00, 0x05]);

	beforeEach(() => {
		socket = { send: jest.fn(), destroy: jest.fn() } as unknown as jest.Mocked<ISocket>;
		room = {
			id: 1,
			reconnect: jest.fn(),
			messageSender: {
				duelStartMessage: jest.fn().mockReturnValue(DUEL_START),
				changeSideMessage: jest.fn().mockReturnValue(CHANGE_SIDE),
			},
		} as unknown as jest.Mocked<YGOProRoom>;
	});

	it("reconnects, asks for the side deck again (not ready) and rotates the token", () => {
		const player = makeClient({ isReady: false, token: "tok" });
		TokenIndex.getInstance().register("tok", player, 1);

		buildState().handleExpressReconnect(reconnectMessage("tok"), room, socket);

		expect(socket.send).toHaveBeenCalledWith(SUCCESS_ACK);
		expect(room.reconnect).toHaveBeenCalledWith(player, socket);
		expect(player.sendMessageToClient).toHaveBeenCalledWith(DUEL_START);
		expect(player.sendMessageToClient).toHaveBeenCalledWith(CHANGE_SIDE);
		expect(TokenIndex.getInstance().find("tok")).toBeUndefined();
		expect(player.setReconnectionToken).toHaveBeenCalledWith(expect.stringMatching(HEX32));
		expect(player.clearReconnecting).toHaveBeenCalled();
	});

	it("does NOT re-send the side prompt when the player already submitted (ready)", () => {
		const player = makeClient({ isReady: true, token: "tok" });
		TokenIndex.getInstance().register("tok", player, 1);

		buildState().handleExpressReconnect(reconnectMessage("tok"), room, socket);

		expect(player.sendMessageToClient).not.toHaveBeenCalledWith(CHANGE_SIDE);
	});

	it("rejects an unknown token with a failure ack and destroys the socket", () => {
		buildState().handleExpressReconnect(reconnectMessage("ghost"), room, socket);

		expect(socket.send).toHaveBeenCalledWith(FAILURE_ACK);
		expect(socket.destroy).toHaveBeenCalled();
		expect(room.reconnect).not.toHaveBeenCalled();
	});
});

// ----------------------------------------------------------------------------
// Express (token) reconnect during rock-paper-scissors.
// ----------------------------------------------------------------------------
describe("YGOProRockPaperScissorState.handleExpressReconnect", () => {
	const DUEL_START = Buffer.from([0x01, 0x00, 0x05]);
	const SELECT_HAND = Buffer.from([0x01, 0x00, 0x06]);

	const buildState = (handResult: number[] = [0, 0]) => {
		const state = Object.create(YGOProRockPaperScissorState.prototype);
		Object.assign(state, { logger: makeLogger(), handResult });
		return state as {
			handleExpressReconnect(message: ClientMessage, room: YGOProRoom, socket: ISocket): void;
		};
	};

	let socket: jest.Mocked<ISocket>;
	let room: jest.Mocked<YGOProRoom>;

	beforeEach(() => {
		socket = { send: jest.fn(), destroy: jest.fn() } as unknown as jest.Mocked<ISocket>;
		room = {
			id: 1,
			reconnect: jest.fn(),
			sendDeckCountMessage: jest.fn(),
			messageSender: {
				duelStartMessage: jest.fn().mockReturnValue(DUEL_START),
				selectHandMessage: jest.fn().mockReturnValue(SELECT_HAND),
			},
		} as unknown as jest.Mocked<YGOProRoom>;
	});

	it("reconnects a captain who has not chosen yet and re-prompts the hand", () => {
		const player = makeClient({ team: 0, captain: true, token: "tok" });
		TokenIndex.getInstance().register("tok", player, 1);

		buildState([0, 0]).handleExpressReconnect(reconnectMessage("tok"), room, socket);

		expect(socket.send).toHaveBeenCalledWith(SUCCESS_ACK);
		expect(room.reconnect).toHaveBeenCalledWith(player, socket);
		expect(player.sendMessageToClient).toHaveBeenCalledWith(DUEL_START);
		expect(player.sendMessageToClient).toHaveBeenCalledWith(SELECT_HAND);
		expect(TokenIndex.getInstance().find("tok")).toBeUndefined();
		expect(player.clearReconnecting).toHaveBeenCalled();
	});

	it("does NOT re-prompt the hand when the captain already chose", () => {
		const player = makeClient({ team: 0, captain: true, token: "tok" });
		TokenIndex.getInstance().register("tok", player, 1);

		buildState([2, 0]).handleExpressReconnect(reconnectMessage("tok"), room, socket);

		expect(player.sendMessageToClient).not.toHaveBeenCalledWith(SELECT_HAND);
	});

	it("rejects an unknown token with a failure ack and destroys the socket", () => {
		buildState().handleExpressReconnect(reconnectMessage("ghost"), room, socket);

		expect(socket.send).toHaveBeenCalledWith(FAILURE_ACK);
		expect(socket.destroy).toHaveBeenCalled();
		expect(room.reconnect).not.toHaveBeenCalled();
	});
});

// ----------------------------------------------------------------------------
// Express (token) reconnect while choosing turn order.
// ----------------------------------------------------------------------------
describe("YGOProChoosingOrderState.handleExpressReconnect", () => {
	const DUEL_START = Buffer.from([0x01, 0x00, 0x05]);
	const SELECT_TP = Buffer.from([0x01, 0x00, 0x07]);

	const buildState = () => {
		const state = Object.create(YGOProChoosingOrderState.prototype);
		Object.assign(state, { logger: makeLogger() });
		return state as {
			handleExpressReconnect(message: ClientMessage, room: YGOProRoom, socket: ISocket): void;
		};
	};

	let socket: jest.Mocked<ISocket>;

	const makeRoom = (chooser: YGOProClient): jest.Mocked<YGOProRoom> =>
		({
			id: 1,
			reconnect: jest.fn(),
			sendDeckCountMessage: jest.fn(),
			clientWhoChoosesTurn: chooser,
			messageSender: {
				duelStartMessage: jest.fn().mockReturnValue(DUEL_START),
				selectTpMessage: jest.fn().mockReturnValue(SELECT_TP),
			},
		}) as unknown as jest.Mocked<YGOProRoom>;

	beforeEach(() => {
		socket = { send: jest.fn(), destroy: jest.fn() } as unknown as jest.Mocked<ISocket>;
	});

	it("re-prompts the turn choice when the reconnecting player is the chooser", () => {
		const player = makeClient({ token: "tok" });
		const room = makeRoom(player);
		TokenIndex.getInstance().register("tok", player, 1);

		buildState().handleExpressReconnect(reconnectMessage("tok"), room, socket);

		expect(socket.send).toHaveBeenCalledWith(SUCCESS_ACK);
		expect(room.reconnect).toHaveBeenCalledWith(player, socket);
		expect(player.sendMessageToClient).toHaveBeenCalledWith(DUEL_START);
		expect(player.sendMessageToClient).toHaveBeenCalledWith(SELECT_TP);
		expect(TokenIndex.getInstance().find("tok")).toBeUndefined();
	});

	it("does NOT re-prompt the turn choice for the non-choosing player", () => {
		const player = makeClient({ token: "tok" });
		const otherChooser = makeClient({ token: "other" });
		const room = makeRoom(otherChooser);
		TokenIndex.getInstance().register("tok", player, 1);

		buildState().handleExpressReconnect(reconnectMessage("tok"), room, socket);

		expect(player.sendMessageToClient).not.toHaveBeenCalledWith(SELECT_TP);
	});

	it("rejects an unknown token with a failure ack and destroys the socket", () => {
		const room = makeRoom(makeClient());
		buildState().handleExpressReconnect(reconnectMessage("ghost"), room, socket);

		expect(socket.send).toHaveBeenCalledWith(FAILURE_ACK);
		expect(socket.destroy).toHaveBeenCalled();
		expect(room.reconnect).not.toHaveBeenCalled();
	});
});
