import YGOProBanListMemoryRepository from "@ygopro/ban-list/infrastructure/YGOProBanListMemoryRepository";
import { YGOProBanList } from "@ygopro/ban-list/domain/YGOProBanList";
import { YGOProRoomMother } from "@test-support/mothers/room/YGOProRoomMother";

function banList(name: string, hash: number): YGOProBanList {
	const list = new YGOProBanList();
	list.setName(name);
	list.setHash(hash);

	return list;
}

describe("YGOProRoom ban list name", () => {
	afterEach(() => {
		YGOProBanListMemoryRepository.replaceAll([]);
	});

	it("reports the loaded list the room was created with, in the room and in the room list", () => {
		YGOProBanListMemoryRepository.replaceAll([banList("2026.05 TCG", 111)]);

		const room = YGOProRoomMother.create({ command: "m#123" });

		expect(room.banListName).toBe("2026.05 TCG");
		expect(room.toRoomListDTO().banlist).toBe("2026.05 TCG");
	});

	it("reports no ban list when none is loaded", () => {
		const room = YGOProRoomMother.create({ command: "m#123" });

		expect(room.banListName).toBeNull();
		expect(room.toRoomListDTO().banlist).toBe("No banlist");
	});
});
