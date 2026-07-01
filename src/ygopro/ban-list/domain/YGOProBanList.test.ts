import { YGOProBanList } from "./YGOProBanList";

describe("YGOProBanList", () => {
	let banList: YGOProBanList;

	beforeEach(() => {
		banList = new YGOProBanList();
	});

	describe("add", () => {
		it("should add to forbidden list when quantity is 0", () => {
			banList.add(123, 0);
			expect(banList.forbidden).toContain(123);
		});

		it("should add to all list when quantity is 3 or more", () => {
			banList.add(123, 3);
			expect(banList.all).toContain(123);
		});
	});

	describe("points (Genesys third column)", () => {
		it("should store the point cost when provided", () => {
			const cardId = 21044178;
			banList.add(cardId, 3, 100);
			expect(banList.points.get(cardId)).toBe(100);
			expect(banList.all).toContain(cardId);
		});

		it("should not store points when the third column is absent", () => {
			banList.add(456, 3);
			expect(banList.points.has(456)).toBe(false);
		});

		it("should ignore a non-numeric point value", () => {
			banList.add(789, 3, NaN);
			expect(banList.points.has(789)).toBe(false);
		});
	});
});
