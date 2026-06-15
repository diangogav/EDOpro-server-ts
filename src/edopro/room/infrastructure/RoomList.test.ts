import RoomList from "./RoomList";
import { Room } from "../domain/Room";
import { TokenIndex } from "@shared/room/domain/TokenIndex";
import { YgoClient } from "@shared/client/domain/YgoClient";

interface FakeClient {
	reconnectionToken: string | null;
	clearReconnectionToken: jest.Mock;
}

const makeClient = (token: string | null = null): FakeClient => {
	const client: FakeClient = {
		reconnectionToken: token,
		clearReconnectionToken: jest.fn(() => {
			client.reconnectionToken = null;
		}),
	};
	return client;
};

const makeRoom = (id: number, clients: FakeClient[] = []): Room =>
	({
		id,
		clients,
		destroy: jest.fn(),
	}) as unknown as Room;

const flushRooms = (): void => {
	const rooms = RoomList.getRooms();
	rooms.splice(0, rooms.length);
};

describe("RoomList.deleteRoom", () => {
	beforeEach(() => {
		TokenIndex.getInstance().clear();
		flushRooms();
	});

	afterEach(() => {
		TokenIndex.getInstance().clear();
		flushRooms();
	});

	it("revokes every client's reconnection token from the global index", () => {
		const client = makeClient("deadbeefdeadbeefdeadbeefdeadbeef");
		const room = makeRoom(1, [client]);
		TokenIndex.getInstance().register(
			client.reconnectionToken!,
			client as unknown as YgoClient,
			room.id,
		);
		RoomList.addRoom(room);

		RoomList.deleteRoom(room);

		expect(
			TokenIndex.getInstance().find("deadbeefdeadbeefdeadbeefdeadbeef"),
		).toBeUndefined();
		expect(client.clearReconnectionToken).toHaveBeenCalled();
	});

	it("leaves tokens belonging to OTHER rooms untouched", () => {
		const room = makeRoom(1, [makeClient()]);
		const otherToken = "cafebabecafebabecafebabecafebabe";
		TokenIndex.getInstance().register(
			otherToken,
			makeClient(otherToken) as unknown as YgoClient,
			9999,
		);
		RoomList.addRoom(room);

		RoomList.deleteRoom(room);

		expect(TokenIndex.getInstance().find(otherToken)).toBeDefined();
	});

	it("destroys the room and removes it from the list", () => {
		const room = makeRoom(2);
		RoomList.addRoom(room);

		RoomList.deleteRoom(room);

		expect(room.destroy).toHaveBeenCalled();
		expect(RoomList.getRooms().find((r) => r.id === 2)).toBeUndefined();
	});
});
