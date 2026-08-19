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

	describe("recomputeWhitelistHash", () => {
		// MDPro3 hashes EVERY entry it parses, including the 3-copy ones a
		// whitelist enumerates, and then XORs the result with 0x0f0f0f0f when it
		// sees `$whitelist`. EDOPro does neither, which is why this lives on the
		// ygopro list only. The hash the ygopro lflist library gives us covers
		// limit 0-2 entries and never matches a whitelist list on any client.
		const WHITELIST_XOR = 0x0f0f0f0f;

		function referenceHash(entries: [number, number][]): number {
			let hash = 0x7dfcee6a;
			for (const [cardId, quantity] of entries) {
				hash =
					hash ^
					((((cardId >>> 0) << 18) >> 0) | (cardId >> 14)) ^
					((((cardId >>> 0) << (27 + quantity)) >>> 0) | (cardId >>> (5 - quantity)));
			}
			return (hash ^ WHITELIST_XOR) >>> 0;
		}

		it("hashes every entry including the 3-copy ones, then applies the whitelist xor", () => {
			const entries: [number, number][] = [
				[72989439, 0],
				[80604091, 1],
				[89631139, 2],
				[910003011, 3],
			];
			for (const [cardId, quantity] of entries) banList.add(cardId, quantity);
			banList.setHash(0xdeadbeef);

			banList.recomputeWhitelistHash();

			expect(banList.hash >>> 0).toBe(referenceHash(entries));
		});

		it("replaces whatever hash the lflist library supplied", () => {
			banList.add(910003011, 3);
			banList.setHash(0xd802337f);
			banList.recomputeWhitelistHash();
			expect(banList.hash >>> 0).not.toBe(0xd802337f);
		});

		it("is order independent, since the entries are combined with xor", () => {
			banList.add(72989439, 0);
			banList.add(910003011, 3);
			banList.recomputeWhitelistHash();
			const forward = banList.hash >>> 0;

			const reversed = new YGOProBanList();
			reversed.add(910003011, 3);
			reversed.add(72989439, 0);
			reversed.recomputeWhitelistHash();

			expect(reversed.hash >>> 0).toBe(forward);
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
