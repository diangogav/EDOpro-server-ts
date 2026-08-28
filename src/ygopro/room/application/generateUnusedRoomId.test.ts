import { generateUniqueId } from "src/utils/generateUniqueId";

import { generateUnusedRoomId } from "./generateUnusedRoomId";
import { YGOProRoom } from "../domain/YGOProRoom";
import YGOProRoomList from "../infrastructure/YGOProRoomList";

jest.mock("src/utils/generateUniqueId");

const mockedGenerateUniqueId = generateUniqueId as jest.MockedFunction<typeof generateUniqueId>;

const seedRoom = (id: number): void => {
	// findById only compares room.id — a stub is all the list needs here.
	YGOProRoomList.addRoom({ id } as unknown as YGOProRoom);
};

const clearRooms = (): void => {
	const rooms = YGOProRoomList.getRooms();
	while (rooms.length) {
		YGOProRoomList.deleteRoom(rooms[0]);
	}
};

describe("generateUnusedRoomId", () => {
	beforeEach(() => {
		mockedGenerateUniqueId.mockReset();
		clearRooms();
	});

	it("returns the first generated id when no live room uses it", () => {
		mockedGenerateUniqueId.mockReturnValueOnce(4321);

		expect(generateUnusedRoomId()).toBe(4321);
	});

	it("retries past ids already used by live rooms (findById is first-match, so a duplicate id would shadow the older room)", () => {
		seedRoom(1111);
		seedRoom(2222);
		mockedGenerateUniqueId
			.mockReturnValueOnce(1111)
			.mockReturnValueOnce(2222)
			.mockReturnValueOnce(3333);

		expect(generateUnusedRoomId()).toBe(3333);
		expect(mockedGenerateUniqueId).toHaveBeenCalledTimes(3);
	});

	it("throws after the bounded number of attempts instead of looping forever", () => {
		seedRoom(1111);
		mockedGenerateUniqueId.mockReturnValue(1111);

		expect(() => generateUnusedRoomId()).toThrow(/room id/i);
		expect(mockedGenerateUniqueId.mock.calls.length).toBeLessThanOrEqual(100);
	});
});
