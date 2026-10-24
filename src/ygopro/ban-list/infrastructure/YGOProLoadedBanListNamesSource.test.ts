import { YGOProBanList } from "@ygopro/ban-list/domain/YGOProBanList";
import ygoproBanListMemoryRepository from "@ygopro/ban-list/infrastructure/YGOProBanListMemoryRepository";

import { YGOProLoadedBanListNamesSource } from "./YGOProLoadedBanListNamesSource";

function ygoproList(name?: string): YGOProBanList {
	const banList = new YGOProBanList();
	if (name !== undefined) {
		banList.setName(name);
	}

	return banList;
}

describe("YGOProLoadedBanListNamesSource", () => {
	afterEach(() => {
		ygoproBanListMemoryRepository.replaceAll([]);
	});

	it("returns the names of the loaded YGOPro banlists and skips nameless ones", () => {
		ygoproBanListMemoryRepository.replaceAll([ygoproList("2026.05 OCG"), ygoproList()]);

		expect(new YGOProLoadedBanListNamesSource().names()).toEqual(["2026.05 OCG"]);
	});
});
