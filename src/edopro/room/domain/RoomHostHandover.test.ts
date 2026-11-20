import { Client } from "@edopro/client/domain/Client";
import { TypeChangeClientMessage } from "@shared/messages/server-to-client/TypeChangeClientMessage";
import { SocketMock } from "@test-support/mocks/socket/SocketMock";
import { RoomMother } from "@test-support/mothers/room/RoomMother";

import { Room } from "./Room";

function socketMock(): SocketMock {
	const socket = new SocketMock();
	socket.send = jest.fn();

	return socket;
}

function sentTo(client: Client): Buffer[] {
	return (client.socket.send as jest.Mock).mock.calls.map(([frame]) => frame as Buffer);
}

function seat(room: Room, name: string): Client {
	const client = room.createPlayerUnsafe(socketMock(), name, null) as Client;
	room.addPlayerUnsafe(client);

	return client;
}

/** The room after its host left: the removal and the handover run in that order. */
async function hostLeaves(room: Room, host: Client): Promise<void> {
	room.removePlayer(host);
	room.passHostOn();
	await room.mutex.runExclusive(() => undefined);
}

function hosts(room: Room): Client[] {
	return (room.players as Client[]).filter((client) => client.host);
}

describe("Room.passHostOn", () => {
	it("makes the player who stays the host and tells it so", async () => {
		const room = RoomMother.create({ team0: 1, team1: 1, createdByServer: true });
		room.waiting();
		const host = seat(room, "First");
		const guest = seat(room, "Second");
		(guest.socket.send as jest.Mock).mockClear();

		await hostLeaves(room, host);

		expect(guest.host).toBe(true);
		expect(hosts(room)).toEqual([guest]);
		expect(sentTo(guest)).toEqual([
			TypeChangeClientMessage.create({ type: (1 << 4) | guest.position }),
		]);
	});

	it("does not make a later joiner the host", async () => {
		const room = RoomMother.create({ team0: 1, team1: 1, createdByServer: true });
		room.waiting();
		const host = seat(room, "First");
		const guest = seat(room, "Second");
		await hostLeaves(room, host);

		const newcomer = seat(room, "Third");

		expect(newcomer.host).toBe(false);
		expect(hosts(room)).toEqual([guest]);
	});

	it("passes the host on to the lowest position when several players stay", async () => {
		const room = RoomMother.create({ team0: 2, team1: 2, createdByServer: true });
		room.waiting();
		const host = seat(room, "First");
		const second = seat(room, "Second");
		const third = seat(room, "Third");

		await hostLeaves(room, host);

		expect(second.position).toBeLessThan(third.position);
		expect(hosts(room)).toEqual([second]);
	});

	it("leaves a room that still has its host alone", () => {
		const room = RoomMother.create({ team0: 1, team1: 1, createdByServer: true });
		room.waiting();
		const host = seat(room, "First");
		const guest = seat(room, "Second");
		(guest.socket.send as jest.Mock).mockClear();

		room.passHostOnUnsafe();

		expect(hosts(room)).toEqual([host]);
		expect(sentTo(guest)).toEqual([]);
	});

	it("does nothing in a room with no player left", () => {
		const room = RoomMother.create({ team0: 1, team1: 1, createdByServer: true });
		room.waiting();

		expect(() => room.passHostOnUnsafe()).not.toThrow();
	});
});
