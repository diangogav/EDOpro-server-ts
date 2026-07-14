import { EdoproBanList } from "../domain/BanList";
import BanListMemoryRepository from "./BanListMemoryRepository";

function makeList(name: string, hash?: number): EdoproBanList {
	const list = new EdoproBanList();
	list.setName(name);
	if (hash !== undefined) {
		list.add(hash, 1); // adds a card so hash is non-zero
	}
	return list;
}

describe("EdoproBanListMemoryRepository.replaceAll", () => {
	beforeEach(() => {
		// Clear the repository between tests using the internal array trick.
		// replaceAll([]) empties it — once it exists; before it does we rely on the
		// fact that the module array starts empty at process start and Jest isolates
		// modules per test file only when configured with resetModules. We clear it
		// via replaceAll once the method is available, but for the red-bar tests we
		// seed and then call replaceAll.
		//
		// NOTE: The module-level array is shared across tests within one file.
		// Use replaceAll([]) in afterEach once the method exists.
	});

	afterEach(() => {
		// Reset to a clean state after each test.
		// This call is intentionally calling the method under test — if it does not
		// exist yet the teardown will also fail, which is correct for the red bar.
		BanListMemoryRepository.replaceAll([]);
	});

	describe("basic replacement", () => {
		it("replaceAll([a, b]) → get() returns [a, b]", () => {
			const a = makeList("List A");
			const b = makeList("List B");

			BanListMemoryRepository.replaceAll([a, b]);

			expect(BanListMemoryRepository.get()).toEqual([a, b]);
		});

		it("replaceAll([]) on a non-empty repo → get() returns []", () => {
			const a = makeList("List A");
			BanListMemoryRepository.replaceAll([a]);

			BanListMemoryRepository.replaceAll([]);

			expect(BanListMemoryRepository.get()).toHaveLength(0);
		});

		it("replaceAll called twice — second call overwrites first", () => {
			const a = makeList("List A");
			const b = makeList("List B");

			BanListMemoryRepository.replaceAll([a]);
			BanListMemoryRepository.replaceAll([b]);

			expect(BanListMemoryRepository.get()).toEqual([b]);
		});
	});

	describe("atomicity — synchronous swap invariant", () => {
		it("get() returns the new list immediately after replaceAll returns — no empty window", () => {
			// This test asserts the synchronous contract.
			// replaceAll MUST NOT contain any await between emptying and refilling the array.
			// Because JS is single-threaded, reading get() right after replaceAll()
			// returns MUST yield the new list, never [].
			const initial = makeList("Initial");
			BanListMemoryRepository.replaceAll([initial]);

			const next = makeList("Next");
			BanListMemoryRepository.replaceAll([next]);

			// Immediately after the call, the list is the new one — never empty.
			const result = BanListMemoryRepository.get();
			expect(result).toHaveLength(1);
			expect(result[0]).toBe(next);
		});
	});

	describe("findByHash / findByName operate on new list after replaceAll", () => {
		it("findByName returns item from the new list", () => {
			const old = makeList("Old List");
			BanListMemoryRepository.replaceAll([old]);

			const fresh = makeList("Fresh List");
			BanListMemoryRepository.replaceAll([fresh]);

			expect(BanListMemoryRepository.findByName("Fresh List")).toBe(fresh);
			expect(BanListMemoryRepository.findByName("Old List")).toBeNull();
		});

		it("findByHash returns item from the new list", () => {
			const a = makeList("A");
			BanListMemoryRepository.replaceAll([a]);
			const aHash = a.hash;

			const b = new EdoproBanList();
			b.setName("B");
			b.add(99999, 1); // different card → different hash
			BanListMemoryRepository.replaceAll([b]);

			expect(BanListMemoryRepository.findByHash(aHash)).toBeNull();
			expect(BanListMemoryRepository.findByHash(b.hash)).toBe(b);
		});
	});
});
