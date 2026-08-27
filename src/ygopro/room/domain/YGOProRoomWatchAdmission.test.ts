/**
 * Watch-intent seam at the WAITING door.
 *
 * A watch joiner ("w,<roomId>") is marked server-side on its socket
 * (watchForRoomId) by the watch strategy. The room's admission target simply
 * offers that joiner no seat, so the unchanged admission policy
 * (RoomAdmission) routes it to the stands — every other rule (ranked-guest
 * rejection, league segregation, reservation gate upstream) still applies.
 */

import { RoomAdmission } from "@shared/room/admission/domain/RoomAdmission";
import { ISocket } from "@shared/socket/domain/ISocket";

import { YGOProRoomMother } from "@test-support/mothers/room/YGOProRoomMother";

jest.mock("@ygopro/SimpleRoomMessageEmitter");

const makeSocket = (overrides: Partial<ISocket> = {}): ISocket =>
	({
		id: `s-${Math.random()}`,
		send: jest.fn(),
		close: jest.fn(),
		destroy: jest.fn(),
		onMessage: jest.fn(),
		removeAllListeners: jest.fn(),
		remoteAddress: "127.0.0.1",
		closed: false,
		...overrides,
	}) as unknown as ISocket;

const playerInfo = { name: "Watcher", password: "" } as never;

describe("YGOProRoom.admissionTarget — watch intent", () => {
	it("offers no seat to a socket watching THIS room, even with seats free", () => {
		const room = YGOProRoomMother.create({ id: 42 });
		const target = room.admissionTarget(makeSocket({ watchForRoomId: 42 }), playerInfo);

		expect(room.hasFreeSeat()).toBe(true);
		expect(target.freeSeat()).toBeNull();
	});

	it("still offers a seat to a socket whose watch intent names a DIFFERENT room", () => {
		const room = YGOProRoomMother.create({ id: 42 });
		const target = room.admissionTarget(makeSocket({ watchForRoomId: 43 }), playerInfo);

		expect(target.freeSeat()).not.toBeNull();
	});

	it("still offers a seat to an unmarked socket (normal joins unaffected)", () => {
		const room = YGOProRoomMother.create({ id: 42 });
		const target = room.admissionTarget(makeSocket(), playerInfo);

		expect(target.freeSeat()).not.toBeNull();
	});

	it("lands a watch joiner of a waiting casual room in the stands: 0 players, 1 spectator", async () => {
		const room = YGOProRoomMother.create({ id: 42 });
		const socket = makeSocket({ watchForRoomId: 42 });
		const target = room.admissionTarget(socket, playerInfo);
		const credential = { kind: "guest" as const, name: "Watcher" };

		const decision = new RoomAdmission().decide(credential, {
			league: target.league,
			freeSeat: target.freeSeat(),
		});
		expect(decision.kind).toBe("spectator");

		await target.admitSpectator(credential);

		expect(room.playersCount).toBe(0);
		expect(room.spectators).toHaveLength(1);
	});
});
