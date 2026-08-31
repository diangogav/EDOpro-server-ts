import edoproBanListMemoryRepository from "src/edopro/ban-list/infrastructure/BanListMemoryRepository";
import { EdoproBanList } from "src/edopro/ban-list/domain/BanList";
import ygoproBanListMemoryRepository from "src/ygopro/ban-list/infrastructure/YGOProBanListMemoryRepository";
import { YGOProBanList } from "src/ygopro/ban-list/domain/YGOProBanList";

import { InMemoryLoadedBanListNamesProvider } from "./InMemoryLoadedBanListNamesProvider";

function edoproList(name: string): EdoproBanList {
	const banList = new EdoproBanList();
	banList.setName(name);

	return banList;
}

function ygoproList(name?: string): YGOProBanList {
	const banList = new YGOProBanList();
	if (name !== undefined) {
		banList.setName(name);
	}

	return banList;
}

describe("InMemoryLoadedBanListNamesProvider", () => {
	const provider = new InMemoryLoadedBanListNamesProvider();

	afterEach(() => {
		edoproBanListMemoryRepository.replaceAll([]);
		ygoproBanListMemoryRepository.replaceAll([]);
	});

	it("combines the names loaded in both servers' repositories", () => {
		edoproBanListMemoryRepository.replaceAll([edoproList("2026.05 TCG")]);
		ygoproBanListMemoryRepository.replaceAll([ygoproList("2026.05 OCG")]);

		expect(provider.names().sort()).toEqual(["2026.05 OCG", "2026.05 TCG"]);
	});

	it("dedupes a name loaded on both sides and skips nameless lists", () => {
		edoproBanListMemoryRepository.replaceAll([edoproList("2026.05 TCG")]);
		ygoproBanListMemoryRepository.replaceAll([ygoproList("2026.05 TCG"), ygoproList()]);

		expect(provider.names()).toEqual(["2026.05 TCG"]);
	});

	it("reflects a hot reload on the next call", () => {
		edoproBanListMemoryRepository.replaceAll([edoproList("2026.05 TCG")]);
		ygoproBanListMemoryRepository.replaceAll([]);

		expect(provider.names()).toEqual(["2026.05 TCG"]);

		edoproBanListMemoryRepository.replaceAll([edoproList("2026.07 TCG")]);
		expect(provider.names()).toEqual(["2026.07 TCG"]);
	});
});
