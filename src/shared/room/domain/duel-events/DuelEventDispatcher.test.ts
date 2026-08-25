import { YgoRoom } from "../YgoRoom";
import { DuelEventDispatcher } from "./DuelEventDispatcher";
import { DamageDealtEvent, TurnStartedEvent } from "./DuelEvents";

const damage: DamageDealtEvent = { roomId: 7, duelId: "d-1", team: 1, amount: 1000, turn: 2 };
const turnStart: TurnStartedEvent = { roomId: 7, duelId: "d-1", player: 0, turn: 3 };
const room = { id: 7 } as unknown as YgoRoom;

describe("DuelEventDispatcher", () => {
	let dispatcher: DuelEventDispatcher;

	beforeEach(() => {
		dispatcher = new DuelEventDispatcher();
	});

	it("delivers the event and room to a subscriber of that kind", () => {
		const handler = jest.fn();
		dispatcher.subscribe("duel.damage", handler);

		dispatcher.dispatch("duel.damage", damage, room);

		expect(handler).toHaveBeenCalledWith(damage, room);
	});

	it("does not deliver to subscribers of other kinds", () => {
		const handler = jest.fn();
		dispatcher.subscribe("duel.turn-start", handler);

		dispatcher.dispatch("duel.damage", damage, room);

		expect(handler).not.toHaveBeenCalled();
	});

	it("delivers to multiple subscribers in subscription order", () => {
		const calls: string[] = [];
		dispatcher.subscribe("duel.damage", () => calls.push("first"));
		dispatcher.subscribe("duel.damage", () => calls.push("second"));

		dispatcher.dispatch("duel.damage", damage, room);

		expect(calls).toEqual(["first", "second"]);
	});

	// Dispatch is synchronous: room mutations must land before the message loop
	// touches the next core message, or later messages in the same batch read
	// stale LP/turn state.
	it("runs subscribers synchronously, before dispatch returns", () => {
		let ran = false;
		dispatcher.subscribe("duel.turn-start", () => {
			ran = true;
		});

		dispatcher.dispatch("duel.turn-start", turnStart, room);

		expect(ran).toBe(true);
	});

	// Internal subscribers are first-party code: an error propagates exactly as
	// it did when the same logic ran inline in processDuelMessage.
	it("propagates a subscriber's error to the dispatch caller", () => {
		dispatcher.subscribe("duel.damage", () => {
			throw new Error("boom");
		});

		expect(() => dispatcher.dispatch("duel.damage", damage, room)).toThrow("boom");
	});

	it("dispatching a kind with no subscribers is a no-op", () => {
		expect(() => dispatcher.dispatch("duel.recover", damage, room)).not.toThrow();
	});
});
