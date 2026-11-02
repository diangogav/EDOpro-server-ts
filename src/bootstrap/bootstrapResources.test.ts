import BanListMemoryRepository from "@edopro/ban-list/infrastructure/BanListMemoryRepository";
import { EdoproBanList } from "@edopro/ban-list/domain/BanList";
import { Logger } from "@shared/logger/domain/Logger";
import YGOProBanListMemoryRepository from "@ygopro/ban-list/infrastructure/YGOProBanListMemoryRepository";
import { YGOProBanList } from "@ygopro/ban-list/domain/YGOProBanList";
import { YGOProRoomMother } from "@test-support/mothers/room/YGOProRoomMother";
import { YGOProRoom } from "@ygopro/room/domain/YGOProRoom";

import { bootstrapResources } from "./bootstrapResources";

jest.mock("./bootstrapEdoproResources", () => ({ bootstrapEdoproResources: jest.fn() }));
jest.mock("./bootstrapYgoproResources", () => ({ bootstrapYgoproResources: jest.fn() }));

function edoproList(name: string, cardId: number): EdoproBanList {
	const banList = new EdoproBanList();
	banList.setName(name);
	banList.add(cardId, 0);

	return banList;
}

function ygoproList(name: string, hash: number): YGOProBanList {
	const banList = new YGOProBanList();
	banList.setName(name);
	banList.setHash(hash);

	return banList;
}

describe("bootstrapResources", () => {
	const logger = { info: jest.fn() } as unknown as Logger;

	afterEach(() => {
		YGOProBanListMemoryRepository.replaceAll([]);
		BanListMemoryRepository.replaceAll([]);
		YGOProRoom.useBanListHashLookup({ hashByName: () => undefined });
	});

	it("lets YGOPro rooms resolve the EDOPro hash of their ban list by name", async () => {
		const edopro = edoproList("Format A", 10000);
		BanListMemoryRepository.replaceAll([edopro]);
		YGOProBanListMemoryRepository.replaceAll([ygoproList("Format A", 111)]);

		await bootstrapResources(logger);

		expect(YGOProRoomMother.create({ command: "m#123" }).edoBanListHash).toBe(edopro.hash);
	});

	it("leaves the hash at 0 when no EDOPro list has that name", async () => {
		BanListMemoryRepository.replaceAll([edoproList("Format B", 10000)]);
		YGOProBanListMemoryRepository.replaceAll([ygoproList("Format A", 111)]);

		await bootstrapResources(logger);

		expect(YGOProRoomMother.create({ command: "m#123" }).edoBanListHash).toBe(0);
	});
});
