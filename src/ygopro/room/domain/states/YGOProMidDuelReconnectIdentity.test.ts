/**
 * Identity binding at the mid-duel JOIN door of every non-waiting state.
 *
 * A ranked external (PIN) seat is only handed back to the account that owns
 * it: each state resolves the joiner's credential BEFORE the reconnect
 * decision and hands the resolved account id to the shared finder. A joiner
 * that only knows the seated player's display name resolves to no account (or
 * a different one) and lands in the stands, with the seat untouched. Casual
 * rooms never consult the resolver — their address+liveness rule is complete
 * without it. States are exercised on prototype instances (same approach as
 * the reserved-room join tests).
 */

import { Logger } from "@shared/logger/domain/Logger";
import { ClientMessage } from "@shared/messages/MessageProcessor";
import { isPairingReconnectRoutingEligible } from "@shared/room/domain/findReconnectingPlayer";
import { ISocket } from "@shared/socket/domain/ISocket";

import { YGOProClient } from "../../../client/domain/YGOProClient";
import { JOINER_IDENTITY_RESOLVE_TIMEOUT_MS } from "../resolveJoinerIdentityWithTimeout";
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
		id: 7,
		ranked: true,
		players: [],
		mutex: { runExclusive: async (fn: () => unknown) => fn() },
		reservationAdmits: jest.fn().mockReturnValue(true),
		rejectReservedJoin: jest.fn(),
		resolveJoinerIdentity: jest.fn().mockResolvedValue(null),
		createSpectatorUnsafe: jest.fn().mockReturnValue(makeSpectator()),
		addSpectatorUnsafe: jest.fn(),
		reconnect: jest.fn(),
		sendDeckCountMessage: jest.fn(),
		sendPreviousDuelsHistoricalMessages: jest.fn(),
		sendCurrentDuelHistoricalMessages: jest.fn(),
		messageSender: {
			duelStartMessage: jest.fn().mockReturnValue(Buffer.from("duel-start")),
			changeSideMessage: jest.fn().mockReturnValue(Buffer.from("change-side")),
			selectHandMessage: jest.fn().mockReturnValue(Buffer.from("select-hand")),
			selectTpMessage: jest.fn().mockReturnValue(Buffer.from("select-tp")),
		},
		...overrides,
	}) as unknown as jest.Mocked<YGOProRoom>;

// A YGOProClient instance (passes `instanceof YGOProClient`) without running
// the real constructor. An external (PIN) seat: weak-auth, but bound to an
// account id.
const makeExternalSeat = (
	userId = "acc-1",
	socket: { closed: boolean; remoteAddress: string | undefined } = {
		closed: false,
		remoteAddress: "10.0.0.1",
	},
): YGOProClient => {
	const client = Object.create(YGOProClient.prototype) as Record<string, unknown>;
	client._credential = { kind: "external", userId };
	client.name = "Jaden";
	client._team = 0;
	client._isReady = true;
	Object.defineProperty(client, "isCaptain", { value: false });
	client.sendMessageToClient = jest.fn();
	client.clearReconnecting = jest.fn();
	client._socket = socket;
	return client as unknown as YGOProClient;
};

const makeCasualSeat = (): YGOProClient => {
	const seat = makeExternalSeat("acc-1", { closed: true, remoteAddress: "127.0.0.1" });
	(seat as unknown as Record<string, unknown>)._credential = null;
	return seat;
};

type JoinCapableState = {
	handleJoin(message: ClientMessage, room: YGOProRoom, socket: ISocket): void | Promise<void>;
};

const buildState = (
	proto: { prototype: object },
	fields: Record<string, unknown> = {},
): JoinCapableState => {
	const state = Object.create(proto.prototype);
	Object.assign(state, { logger: makeLogger(), ...fields });
	return state as JoinCapableState;
};

const states: Array<{
	label: string;
	build: (room: jest.Mocked<YGOProRoom>) => JoinCapableState;
}> = [
	{
		label: "YGOProDuelingState",
		build: (room) => buildState(YGOProDuelingState, { room }),
	},
	{
		label: "YGOProRockPaperScissorState",
		build: () => buildState(YGOProRockPaperScissorState, { handResult: [0, 0] }),
	},
	{
		label: "YGOProChoosingOrderState",
		build: () => buildState(YGOProChoosingOrderState),
	},
	{
		label: "YGOProSideDeckingState",
		build: () => buildState(YGOProSideDeckingState),
	},
];

describe.each(states)("$label.handleJoin — ranked identity binding", ({ build }) => {
	it("grants the seat back to the account that owns it — even while the old socket looks alive", async () => {
		const seat = makeExternalSeat("acc-1");
		const room = makeRoom({ players: [seat] });
		(room.resolveJoinerIdentity as jest.Mock).mockResolvedValue("acc-1");
		const socket = makeSocket();

		await build(room).handleJoin(makeJoinMessage(), room, socket);

		expect(room.reconnect).toHaveBeenCalledWith(seat, socket);
		expect(room.createSpectatorUnsafe).not.toHaveBeenCalled();
	});

	it("sends a name-only joiner with NO account to the stands and leaves the seat untouched", async () => {
		const seat = makeExternalSeat("acc-1");
		const room = makeRoom({ players: [seat] });
		(room.resolveJoinerIdentity as jest.Mock).mockResolvedValue(null);
		const socket = makeSocket();

		await build(room).handleJoin(makeJoinMessage(), room, socket);

		expect(room.reconnect).not.toHaveBeenCalled();
		expect(room.createSpectatorUnsafe).toHaveBeenCalledWith(socket, "Jaden");
		expect(room.addSpectatorUnsafe).toHaveBeenCalled();
	});

	it("sends a name-only joiner with a DIFFERENT account to the stands", async () => {
		const seat = makeExternalSeat("acc-1");
		const room = makeRoom({ players: [seat] });
		(room.resolveJoinerIdentity as jest.Mock).mockResolvedValue("acc-2");
		const socket = makeSocket();

		await build(room).handleJoin(makeJoinMessage(), room, socket);

		expect(room.reconnect).not.toHaveBeenCalled();
		expect(room.addSpectatorUnsafe).toHaveBeenCalled();
	});

	it("never consults the identity resolver in a casual room — the address+liveness rule stands alone", async () => {
		const seat = makeCasualSeat();
		const room = makeRoom({ ranked: false, players: [seat] });
		const socket = makeSocket();

		await build(room).handleJoin(makeJoinMessage(), room, socket);

		expect(room.resolveJoinerIdentity).not.toHaveBeenCalled();
		expect(room.reconnect).toHaveBeenCalledWith(seat, socket);
	});

	it("resolves the identity and re-seats atomically under the room mutex — no seat decision outside the lock", async () => {
		const seat = makeExternalSeat("acc-1");
		let mutexHeld = false;
		let resolvedWhileHeld: boolean | undefined;
		let reconnectedWhileHeld: boolean | undefined;
		const room = makeRoom({
			players: [seat],
			mutex: {
				runExclusive: async (fn: () => Promise<unknown>) => {
					mutexHeld = true;
					try {
						return await fn();
					} finally {
						mutexHeld = false;
					}
				},
			},
		});
		(room.resolveJoinerIdentity as jest.Mock).mockImplementation(async () => {
			resolvedWhileHeld = mutexHeld;
			return "acc-1";
		});
		(room.reconnect as jest.Mock).mockImplementation(() => {
			reconnectedWhileHeld = mutexHeld;
		});
		const socket = makeSocket();

		await build(room).handleJoin(makeJoinMessage(), room, socket);

		expect(resolvedWhileHeld).toBe(true);
		expect(reconnectedWhileHeld).toBe(true);
	});

	it("fails closed when the identity resolver is unavailable — the joiner lands in the stands, the seat is untouched, and nothing rejects", async () => {
		const seat = makeExternalSeat("acc-1");
		const room = makeRoom({ players: [seat] });
		(room.resolveJoinerIdentity as jest.Mock).mockRejectedValue(new Error("db down"));
		const socket = makeSocket();

		// The JOIN listener voids this promise, so a rejection here would escape
		// to the global uncaughtException hook — resolving IS the contract.
		await expect(build(room).handleJoin(makeJoinMessage(), room, socket)).resolves.toBeUndefined();

		expect(room.reconnect).not.toHaveBeenCalled();
		expect(room.createSpectatorUnsafe).toHaveBeenCalledWith(socket, "Jaden");
		expect(room.addSpectatorUnsafe).toHaveBeenCalled();
	});

	it("bounds a HUNG identity resolver: the joiner lands in the stands within the timeout, the seat is untouched, and the mutex releases", async () => {
		jest.useFakeTimers();
		try {
			const seat = makeExternalSeat("acc-1");
			let mutexReleased = false;
			const room = makeRoom({
				players: [seat],
				mutex: {
					runExclusive: async (fn: () => Promise<unknown>) => {
						try {
							return await fn();
						} finally {
							mutexReleased = true;
						}
					},
				},
			});
			// A hung connection neither resolves nor rejects — the promise stays
			// pending forever, so only a bounded wait can end the exclusive section.
			(room.resolveJoinerIdentity as jest.Mock).mockReturnValue(new Promise(() => undefined));
			const socket = makeSocket();

			const join = build(room).handleJoin(makeJoinMessage(), room, socket);
			await jest.advanceTimersByTimeAsync(JOINER_IDENTITY_RESOLVE_TIMEOUT_MS);

			// Same contract as the rejecting resolver: the voided JOIN promise
			// resolves — a timeout must not escape to the global hook.
			await expect(join).resolves.toBeUndefined();

			expect(room.reconnect).not.toHaveBeenCalled();
			expect(room.createSpectatorUnsafe).toHaveBeenCalledWith(socket, "Jaden");
			expect(room.addSpectatorUnsafe).toHaveBeenCalled();
			expect(mutexReleased).toBe(true);
		} finally {
			jest.useRealTimers();
		}
	});

	it("a watch-stamped socket spectates even when it presents the seat's own account", async () => {
		const seat = makeExternalSeat("acc-1");
		const room = makeRoom({ players: [seat] });
		(room.resolveJoinerIdentity as jest.Mock).mockResolvedValue("acc-1");
		const socket = makeSocket({ watchForRoomId: 7 });

		await build(room).handleJoin(makeJoinMessage(), room, socket);

		expect(room.reconnect).not.toHaveBeenCalled();
		expect(room.addSpectatorUnsafe).toHaveBeenCalled();
	});
});

describe("routing-to-door integration — the routing-only predicate never bypasses the identity gate", () => {
	it("a pairing reconnect ROUTED in by the identity-less predicate is RE-GATED at the mid-duel door: a non-matching identity lands in the stands", async () => {
		const seat = makeExternalSeat("acc-1", { closed: false, remoteAddress: "10.0.0.1" });

		// Routing (findOrCreateRoom) sees the seat as reconnect-eligible without
		// resolving any identity — the join reaches the mid-duel room...
		expect(
			isPairingReconnectRoutingEligible({
				players: [seat],
				name: "Jaden",
				remoteAddress: "5.5.5.5",
				ranked: true,
			}),
		).toBe(true);

		// ...but the room's own door resolves the joiner to a DIFFERENT account,
		// so the seat stays untouched and the joiner spectates.
		const room = makeRoom({ players: [seat] });
		(room.resolveJoinerIdentity as jest.Mock).mockResolvedValue("acc-2");
		const socket = makeSocket({ remoteAddress: "5.5.5.5" });

		await buildState(YGOProDuelingState, { room }).handleJoin(makeJoinMessage(), room, socket);

		expect(room.reconnect).not.toHaveBeenCalled();
		expect(room.addSpectatorUnsafe).toHaveBeenCalled();
	});
});
