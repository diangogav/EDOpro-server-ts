import { Client } from "@edopro/client/domain/Client";
import { ClientMother } from "@test-support/mothers/client/ClientMother";
import { RoomMother } from "@test-support/mothers/room/RoomMother";

import { Room } from "./Room";

const RELAY = 0x80;

function seat(room: Room, team: number, positions: number[]): Client[] {
	return positions.map((position) => {
		const client = ClientMother.create({ team, position, host: position === 0, roomId: room.id });
		room.addPlayerUnsafe(client);

		return client;
	});
}

function snapshot(players: Client[]): Array<[number, boolean]> {
	return players.map((p) => [p.duelPosition, p.inTurn]);
}

describe("Room turn order", () => {
	it.each([
		[
			0,
			[
				[0, true],
				[1, false],
			],
			[
				[1, false],
				[0, true],
			],
		],
		[
			1,
			[
				[1, false],
				[0, true],
			],
			[
				[0, true],
				[1, false],
			],
		],
	])("gives the team that plays first (team %i) its first seat as duel position 0 in a tag duel", (first, team0, team1) => {
		const room = RoomMother.create({ team0: 2, team1: 2, duelFlagsLow: 0 });
		const t0 = seat(room, 0, [0, 1]);
		const t1 = seat(room, 1, [2, 3]);
		room.setFirstToPlay(first);

		room.prepareTurnOrder();

		expect(snapshot(t0)).toEqual(team0);
		expect(snapshot(t1)).toEqual(team1);
	});

	it("keeps seat order for both teams in relay duels", () => {
		const room = RoomMother.create({ team0: 2, team1: 2, duelFlagsLow: RELAY });
		const t0 = seat(room, 0, [0, 1]);
		const t1 = seat(room, 1, [2, 3]);
		room.setFirstToPlay(1);

		room.prepareTurnOrder();

		expect(snapshot(t0)).toEqual([
			[0, true],
			[1, false],
		]);
		expect(snapshot(t1)).toEqual([
			[0, true],
			[1, false],
		]);
	});

	it("puts every player of a one-player team at duel position 0", () => {
		const room = RoomMother.create({ team0: 1, team1: 1, duelFlagsLow: 0 });
		const [a] = seat(room, 0, [0]);
		const [b] = seat(room, 1, [1]);
		room.setFirstToPlay(0);

		room.prepareTurnOrder();

		expect([a.duelPosition, a.inTurn, b.duelPosition, b.inTurn]).toEqual([0, true, 0, true]);
	});

	it("clears turns left over from the previous duel", () => {
		const room = RoomMother.create({ team0: 2, team1: 1, duelFlagsLow: 0 });
		const t0 = seat(room, 0, [0, 1]);
		seat(room, 1, [2]);
		room.setFirstToPlay(0);
		t0[1].turn();

		room.prepareTurnOrder();

		expect(snapshot(t0)).toEqual([
			[0, true],
			[1, false],
		]);
	});

	it("passes the turn to the next duel position of the team and wraps around", () => {
		const room = RoomMother.create({ team0: 3, team1: 1, duelFlagsLow: 0 });
		const t0 = seat(room, 0, [0, 1, 2]);
		const [other] = seat(room, 1, [3]);
		room.setFirstToPlay(0);
		room.prepareTurnOrder();

		room.nextTurn(0);
		expect(t0.map((p) => p.inTurn)).toEqual([false, true, false]);

		room.nextTurn(0);
		room.nextTurn(0);
		expect(t0.map((p) => p.inTurn)).toEqual([true, false, false]);
		expect(other.inTurn).toBe(true);
	});

	it("does nothing when no player of the team holds the turn", () => {
		const room = RoomMother.create({ team0: 2, team1: 1, duelFlagsLow: 0 });
		const t0 = seat(room, 0, [0, 1]);

		room.nextTurn(0);
		room.nextTurn(1);

		expect(t0.some((p) => p.inTurn)).toBe(false);
	});
});
