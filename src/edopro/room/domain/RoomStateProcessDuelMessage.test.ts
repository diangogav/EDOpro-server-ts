/**
 * RoomState.processDuelMessage behavior contract: team = firstToPlay ^ data[1],
 * amount = data.readUint32LE(2), one UPDATE-ROOM broadcast per handled message,
 * and unhandled message types touch nothing.
 */
import { EventEmitter } from "stream";

import { CoreMessages } from "src/edopro/messages/domain/CoreMessages";

jest.mock("../../../web-socket-server/WebSocketSingleton", () => {
	const mockBroadcast = jest.fn();
	return {
		__esModule: true,
		default: {
			getInstance: () => ({ broadcast: mockBroadcast }),
		},
		mockBroadcast,
	};
});

import { DuelEventPluginHub } from "../../../shared/room/domain/duel-events/DuelEventPluginHub";
import { RoomState } from "./RoomState";
import { YgoRoom } from "../../../shared/room/domain/YgoRoom";
import WebSocketSingleton from "../../../web-socket-server/WebSocketSingleton";

// jest.mock above is hoisted, so this import resolves to the mock; getInstance()
// hands back the same broadcast spy the factory created.
const mockBroadcast = WebSocketSingleton.getInstance().broadcast as jest.Mock;

// processDuelMessage is protected; expose it for the test.
class TestRoomState extends RoomState {
	run(messageType: CoreMessages, data: Buffer, room: YgoRoom): void {
		this.processDuelMessage(messageType, data, room);
	}
}

// [type u8, player u8, amount u32le] — the layout both cores emit
// (edo9300 operations.cpp:603/674/749, processor.cpp:3334; the classic
// encoder produces identical bytes).
const lpPayload = (type: number, player: number, amount: number): Buffer => {
	const buf = Buffer.alloc(6);
	buf.writeUint8(type, 0);
	buf.writeUint8(player, 1);
	buf.writeUint32LE(amount, 2);
	return buf;
};

const makeRoom = (firstToPlay: number) =>
	({
		id: 7,
		firstToPlay,
		turn: 2,
		decreaseLps: jest.fn(),
		increaseLps: jest.fn(),
		increaseTurn: jest.fn(),
		toRealTimePresentation: jest.fn().mockReturnValue({ id: 7 }),
	}) as unknown as YgoRoom;

describe("RoomState.processDuelMessage", () => {
	let state: TestRoomState;

	beforeEach(() => {
		mockBroadcast.mockClear();
		state = new TestRoomState(new EventEmitter());
	});

	it("MSG_DAMAGE decreases the XOR-mapped team's LPs and broadcasts", () => {
		const room = makeRoom(0);

		state.run(CoreMessages.MSG_DAMAGE, lpPayload(CoreMessages.MSG_DAMAGE, 1, 1000), room);

		expect(room.decreaseLps).toHaveBeenCalledWith(1, 1000);
		expect(mockBroadcast).toHaveBeenCalledWith(expect.objectContaining({ action: "UPDATE-ROOM" }));
	});

	it("MSG_DAMAGE maps the team through firstToPlay (swapped first-to-play flips it)", () => {
		const room = makeRoom(1);

		state.run(CoreMessages.MSG_DAMAGE, lpPayload(CoreMessages.MSG_DAMAGE, 1, 1000), room);

		expect(room.decreaseLps).toHaveBeenCalledWith(0, 1000);
	});

	it("MSG_RECOVER increases the XOR-mapped team's LPs and broadcasts", () => {
		const room = makeRoom(0);

		state.run(CoreMessages.MSG_RECOVER, lpPayload(CoreMessages.MSG_RECOVER, 0, 500), room);

		expect(room.increaseLps).toHaveBeenCalledWith(0, 500);
		expect(mockBroadcast).toHaveBeenCalledTimes(1);
	});

	it("MSG_PAY_LPCOST decreases the XOR-mapped team's LPs and broadcasts", () => {
		const room = makeRoom(0);

		state.run(CoreMessages.MSG_PAY_LPCOST, lpPayload(CoreMessages.MSG_PAY_LPCOST, 1, 800), room);

		expect(room.decreaseLps).toHaveBeenCalledWith(1, 800);
		expect(mockBroadcast).toHaveBeenCalledTimes(1);
	});

	it("MSG_NEW_TURN increases the turn and broadcasts", () => {
		const room = makeRoom(0);

		state.run(CoreMessages.MSG_NEW_TURN, Buffer.from([CoreMessages.MSG_NEW_TURN, 1]), room);

		expect(room.increaseTurn).toHaveBeenCalledTimes(1);
		expect(mockBroadcast).toHaveBeenCalledTimes(1);
	});

	it("does nothing for an unhandled message type", () => {
		const room = makeRoom(0);

		state.run(CoreMessages.MSG_DRAW, Buffer.from([CoreMessages.MSG_DRAW]), room);

		expect(room.decreaseLps).not.toHaveBeenCalled();
		expect(room.increaseLps).not.toHaveBeenCalled();
		expect(room.increaseTurn).not.toHaveBeenCalled();
		expect(mockBroadcast).not.toHaveBeenCalled();
	});

	describe("plugin delivery through the hub", () => {
		beforeEach(() => {
			DuelEventPluginHub.resetInstance();
		});

		afterEach(() => {
			DuelEventPluginHub.resetInstance();
		});

		it("delivers decoded events to a hub-registered plugin handler, off the dispatch path", async () => {
			const received: unknown[] = [];
			DuelEventPluginHub.getInstance().register("stats", "duel.damage", (event) => {
				received.push(event);
			});
			const pluginState = new TestRoomState(new EventEmitter());
			const room = makeRoom(0);

			pluginState.run(CoreMessages.MSG_DAMAGE, lpPayload(CoreMessages.MSG_DAMAGE, 1, 1000), room);

			// Nothing synchronously — the queue drains on a microtask.
			expect(received).toEqual([]);
			await new Promise((resolve) => setImmediate(resolve));

			expect(received).toEqual([{ roomId: 7, team: 1, amount: 1000, turn: 2 }]);
		});

		// TurnStartedEvent.turn is the number of the turn that just started. The
		// room counter increments inside the internal subscriber, after the event
		// is built, so the event must carry room.turn + 1 — matching the ygopro
		// pipeline, whose counter has already incremented when it dispatches.
		it("turn-start carries the number of the turn that just started", async () => {
			const received: unknown[] = [];
			DuelEventPluginHub.getInstance().register("stats", "duel.turn-start", (event) => {
				received.push(event);
			});
			const pluginState = new TestRoomState(new EventEmitter());
			const room = makeRoom(0); // room.turn = 2

			pluginState.run(CoreMessages.MSG_NEW_TURN, Buffer.from([CoreMessages.MSG_NEW_TURN, 1]), room);
			await new Promise((resolve) => setImmediate(resolve));

			expect(received).toEqual([{ roomId: 7, player: 1, turn: 3 }]);
		});
	});
});
