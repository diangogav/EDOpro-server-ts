import BanListMemoryRepository from "@edopro/ban-list/infrastructure/BanListMemoryRepository";
import { EdoproBanList } from "@edopro/ban-list/domain/BanList";
import { RoomMother } from "@test-support/mothers/room/RoomMother";

function banList(name: string, cardId: number): EdoproBanList {
	const list = new EdoproBanList();
	list.setName(name);
	list.add(cardId, 0);

	return list;
}

describe("Room ban list name", () => {
	afterEach(() => {
		BanListMemoryRepository.replaceAll([]);
	});

	it("reports the loaded list whose hash the room was created with", () => {
		const list = banList("2026.05 TCG", 10000);
		BanListMemoryRepository.replaceAll([list]);

		expect(RoomMother.create({ banListHash: list.hash }).banListName).toBe("2026.05 TCG");
	});

	it("reports no ban list when no loaded list has the room's hash", () => {
		BanListMemoryRepository.replaceAll([banList("2026.05 TCG", 10000)]);

		expect(RoomMother.create({ banListHash: 42 }).banListName).toBeNull();
	});
});
