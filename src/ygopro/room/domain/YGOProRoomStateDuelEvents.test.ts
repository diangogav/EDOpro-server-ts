/**
 * The ygopro pipeline applies LP/turn mutations in its ocgcore middleware, so
 * its dispatcher must NOT carry the EDOPro internal subscribers — dispatching a
 * duel event from a ygopro state would otherwise apply the mutation twice (the
 * middleware already called decreaseLps). Plugin delivery through the hub is
 * the only thing a ygopro dispatcher carries.
 */
import { EventEmitter } from "stream";

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

import { DuelEventPluginHub } from "@shared/room/domain/duel-events/DuelEventPluginHub";
import { DamageDealtEvent } from "@shared/room/domain/duel-events/DuelEvents";
import WebSocketSingleton from "../../../web-socket-server/WebSocketSingleton";

import { YGOProRoom } from "./YGOProRoom";
import { YGOProRoomState } from "./YGOProRoomState";

const mockBroadcast = WebSocketSingleton.getInstance().broadcast as jest.Mock;

class TestYgoState extends YGOProRoomState {
	fire(event: DamageDealtEvent, room: YGOProRoom): void {
		this.duelEvents.dispatch("duel.damage", event, room);
	}
}

describe("YGOProRoomState duel-event dispatcher", () => {
	beforeEach(() => {
		DuelEventPluginHub.resetInstance();
		mockBroadcast.mockClear();
	});

	afterEach(() => {
		DuelEventPluginHub.resetInstance();
	});

	const damage: DamageDealtEvent = { roomId: 7, team: 1, amount: 1000, turn: 2 };

	it("does not run the EDOPro internal subscribers (no double LP mutation, no broadcast)", () => {
		const state = new TestYgoState(new EventEmitter());
		const room = { id: 7, decreaseLps: jest.fn() } as unknown as YGOProRoom;

		state.fire(damage, room);

		expect(room.decreaseLps).not.toHaveBeenCalled();
		expect(mockBroadcast).not.toHaveBeenCalled();
	});

	it("still delivers to hub-registered plugin handlers", async () => {
		const received: unknown[] = [];
		DuelEventPluginHub.getInstance().register("stats", "duel.damage", (event) => {
			received.push(event);
		});
		const state = new TestYgoState(new EventEmitter());
		const room = { id: 7, decreaseLps: jest.fn() } as unknown as YGOProRoom;

		state.fire(damage, room);
		await new Promise((resolve) => setImmediate(resolve));

		expect(received).toEqual([damage]);
	});
});
