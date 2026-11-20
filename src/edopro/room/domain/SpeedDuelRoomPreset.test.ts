import { Client } from "@edopro/client/domain/Client";
import { PlayerChangeClientMessage } from "@edopro/messages/server-to-client/PlayerChangeClientMessage";
import { PlayerEnterClientMessage } from "@shared/messages/server-to-client/PlayerEnterClientMessage";
import { TypeChangeClientMessage } from "@shared/messages/server-to-client/TypeChangeClientMessage";
import { SocketMock } from "@test-support/mocks/socket/SocketMock";
import { ClientMother } from "@test-support/mothers/client/ClientMother";
import { RoomMother } from "@test-support/mothers/room/RoomMother";

import { speedDuelRoomAttributes } from "./SpeedDuelRoomPreset";

const SPEED_DUEL_FLAGS = 0x628000;
const ANYTHING_GOES = 4;

function preset(bestOf: 1 | 3 = 1) {
	return speedDuelRoomAttributes({
		id: 4321,
		name: "speed,casual",
		password: "",
		bestOf,
		banListHash: -559038737,
	});
}

describe("speedDuelRoomAttributes", () => {
	it("sets the duel to EDOPro's Speed Duel mode with no forbidden type and no extra rule", () => {
		expect(preset()).toMatchObject({
			duelFlagsLow: SPEED_DUEL_FLAGS,
			duelFlagsHight: 0,
			duelFlag: BigInt(SPEED_DUEL_FLAGS),
			forbiddenTypes: 0,
			extraRules: 0,
		});
	});

	it("starts at 4000 LP with a hand of 4 and a draw of 1", () => {
		expect(preset()).toMatchObject({ startLp: 4000, startHand: 4, drawCount: 1 });
	});

	it("takes decks of 20-30, Extra Decks of 0-6 and Side Decks of 0-6", () => {
		expect(preset()).toMatchObject({
			mainMin: 20,
			mainMax: 30,
			extraMin: 0,
			extraMax: 6,
			sideMin: 0,
			sideMax: 6,
		});
	});

	it("lets the ban list alone decide the cards: any scope, decks checked and shuffled", () => {
		expect(preset()).toMatchObject({
			rule: ANYTHING_GOES,
			noCheck: false,
			noShuffle: false,
			banListHash: -559038737,
		});
	});

	it("is a 1v1 room that is never ranked, with the server's time limit", () => {
		expect(preset()).toMatchObject({ team0: 1, team1: 1, ranked: false, timeLimit: 450 });
	});

	it("is marked as created by the server", () => {
		expect(preset().createdByServer).toBe(true);
	});

	it.each([1, 3] as const)("plays a best of %p", (bestOf) => {
		expect(preset(bestOf).bestOf).toBe(bestOf);
	});

	it("needs a password only when one was given", () => {
		const locked = speedDuelRoomAttributes({
			id: 1,
			name: "speed",
			password: "secret",
			bestOf: 1,
			banListHash: 1,
		});

		expect(preset()).toMatchObject({ needPass: false, password: "" });
		expect(locked).toMatchObject({ needPass: true, password: "secret" });
	});

	it("builds a room a client of the YGOPro server can sit in", () => {
		const room = RoomMother.create(preset());

		expect(room.seatsYgoproClients).toBe(true);
		expect(room.createdByServer).toBe(true);
	});
});

describe("Room.createdByServer", () => {
	it("is false for a room that does not say so, as one hosted by a client", () => {
		expect(RoomMother.create().createdByServer).toBe(false);
	});
});

describe("Room.addPlayerUnsafe", () => {
	function sentTo(socket: SocketMock): Buffer[] {
		return (socket.send as jest.Mock).mock.calls.map(([frame]) => frame as Buffer);
	}

	function socketMock(): SocketMock {
		const socket = new SocketMock();
		socket.send = jest.fn();

		return socket;
	}

	it("tells a host who enters a room with a player seated who that player is", () => {
		const room = RoomMother.create(preset());
		room.waiting();
		const seated = ClientMother.create({ host: false, name: "Seated", position: 1, team: 1 });
		room.addPlayerUnsafe(seated);
		const socket = socketMock();
		const host = room.createPlayerUnsafe(socket, "Newcomer", null) as Client;

		room.addPlayerUnsafe(host);

		expect(host.host).toBe(true);
		expect(sentTo(socket)).toContainEqual(PlayerEnterClientMessage.create("Seated", 1));
	});

	it("sends a host who enters an empty room nothing about other players", () => {
		const room = RoomMother.create({ team0: 1, team1: 1 });
		room.waiting();
		const socket = socketMock();
		const host = room.createPlayerUnsafe(socket, "Host", null) as Client;

		room.addPlayerUnsafe(host);

		expect(sentTo(socket)).toEqual([
			PlayerEnterClientMessage.create("Host", 0),
			PlayerChangeClientMessage.create({ status: (0 << 4) | 0xa }),
			TypeChangeClientMessage.create({ type: 0x10 }),
		]);
	});
});
