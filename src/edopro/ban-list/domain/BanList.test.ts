import { EdoproBanList } from "./BanList";

describe("EdoproBanList", () => {
	let banList: EdoproBanList;

	beforeEach(() => {
		banList = new EdoproBanList();
	});

	describe("add", () => {
		it("should ignore NaN cardId", () => {
			banList.add(NaN, 1);
			expect(banList.limited).toHaveLength(0);
		});

		it("should add to forbidden list when quantity is 0", () => {
			const cardId = 123;
			banList.add(cardId, 0);
			expect(banList.forbidden).toContain(cardId);
			expect(banList.limited).not.toContain(cardId);
			expect(banList.semiLimited).not.toContain(cardId);
			expect(banList.all).not.toContain(cardId);
		});

		it("should add to limited list when quantity is 1", () => {
			const cardId = 456;
			banList.add(cardId, 1);
			expect(banList.forbidden).not.toContain(cardId);
			expect(banList.limited).toContain(cardId);
			expect(banList.semiLimited).not.toContain(cardId);
			expect(banList.all).not.toContain(cardId);
		});

		it("should add to semiLimited list when quantity is 2", () => {
			const cardId = 789;
			banList.add(cardId, 2);
			expect(banList.forbidden).not.toContain(cardId);
			expect(banList.limited).not.toContain(cardId);
			expect(banList.semiLimited).toContain(cardId);
			expect(banList.all).not.toContain(cardId);
		});

		it("should add to all list when quantity is 3", () => {
			const cardId = 101112;
			banList.add(cardId, 3);
			expect(banList.forbidden).not.toContain(cardId);
			expect(banList.limited).not.toContain(cardId);
			expect(banList.semiLimited).not.toContain(cardId);
			expect(banList.all).toContain(cardId);
		});

		it("should update hash when adding a card", () => {
			const initialHash = banList.hash;
			banList.add(123, 1);
			expect(banList.hash).not.toBe(initialHash);
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
			const cardId = 456;
			banList.add(cardId, 3);
			expect(banList.points.has(cardId)).toBe(false);
		});

		it("should ignore a non-numeric point value", () => {
			const cardId = 789;
			banList.add(cardId, 3, NaN);
			expect(banList.points.has(cardId)).toBe(false);
		});

		it("should not let points affect the hash", () => {
			const withPoints = new EdoproBanList();
			const withoutPoints = new EdoproBanList();
			withPoints.add(123, 3, 50);
			withoutPoints.add(123, 3);
			expect(withPoints.hash).toBe(withoutPoints.hash);
		});
	});

	describe("isGenesys", () => {
		it("should return true if name is Genesys", () => {
			banList.setName("Genesys");
			expect(banList.isGenesys()).toBe(true);
		});

		it("should return false if name is not Genesys", () => {
			banList.setName("OCG");
			expect(banList.isGenesys()).toBe(false);
		});
	});
});
