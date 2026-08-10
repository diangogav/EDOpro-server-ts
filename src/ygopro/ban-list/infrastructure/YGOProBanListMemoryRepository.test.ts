import { YGOProBanList } from "../domain/YGOProBanList";
import YGOProBanListMemoryRepository from "./YGOProBanListMemoryRepository";
import LoggerFactory from "src/shared/logger/infrastructure/LoggerFactory";

function makeBanList(name: string, hash: number, alias?: string): YGOProBanList {
	const banList = new YGOProBanList();
	banList.setName(name);
	banList.setHash(hash);
	if (alias !== undefined) {
		banList.setAlias(alias);
	}
	return banList;
}

describe("YGOProBanListMemoryRepository", () => {
	afterEach(() => {
		YGOProBanListMemoryRepository.clear();
		jest.restoreAllMocks();
	});

	describe("findIndexByAlias", () => {
		it("matches by normalized (lowercased, whitespace-stripped) substring inclusion", () => {
			YGOProBanListMemoryRepository.add(makeBanList("2026.04 Edison Format", 1));
			expect(YGOProBanListMemoryRepository.findIndexByAlias("edison")).toBe(0);
			expect(YGOProBanListMemoryRepository.findIndexByAlias("EDISON")).toBe(0);
			expect(YGOProBanListMemoryRepository.findIndexByAlias("Edison Format")).toBe(0);
		});

		it("ignores internal whitespace differences when normalizing", () => {
			YGOProBanListMemoryRepository.add(makeBanList("Master Duel Classic", 1));
			expect(YGOProBanListMemoryRepository.findIndexByAlias("masterduelclassic")).toBe(0);
		});

		it("returns -1 when no list matches the alias", () => {
			YGOProBanListMemoryRepository.add(makeBanList("2026.04 OCG", 1));
			expect(YGOProBanListMemoryRepository.findIndexByAlias("edison")).toBe(-1);
		});

		it("prefers an EXACT normalized-name match over a substring match elsewhere in the list", () => {
			// "goat" is a substring of "goatee format" (index 0), but "GOAT" (index 1)
			// is an exact normalized match — exact match must win regardless of order.
			YGOProBanListMemoryRepository.add(makeBanList("Goatee Format", 1));
			YGOProBanListMemoryRepository.add(makeBanList("GOAT", 2));

			expect(YGOProBanListMemoryRepository.findIndexByAlias("goat")).toBe(1);
		});

		it("falls back to substring inclusion when there is no exact match", () => {
			YGOProBanListMemoryRepository.add(makeBanList("2026.04 Edison Format", 1));
			expect(YGOProBanListMemoryRepository.findIndexByAlias("edison")).toBe(0);
		});

		it("logs a warning naming the alias and the winners when the substring path matches more than one list", () => {
			const warnSpy = jest
				.spyOn(LoggerFactory.getLogger(), "warn")
				.mockImplementation(() => undefined);

			YGOProBanListMemoryRepository.add(makeBanList("2026.04 Edison Format", 1));
			YGOProBanListMemoryRepository.add(makeBanList("2026.05 Edison Revised", 2));

			const result = YGOProBanListMemoryRepository.findIndexByAlias("edison");

			// Ambiguous substring match resolves deterministically by shortest
			// normalized name ("2026.04 Edison Format" is shorter than "2026.05
			// Edison Revised") and surfaces a warning so the ambiguity is diagnosable.
			expect(result).toBe(0);
			expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("edison"));
			expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("2026.04 Edison Format"));
			expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("2026.05 Edison Revised"));
		});

		it("does NOT warn when the substring path matches exactly one list", () => {
			const warnSpy = jest
				.spyOn(LoggerFactory.getLogger(), "warn")
				.mockImplementation(() => undefined);

			YGOProBanListMemoryRepository.add(makeBanList("2026.04 Edison Format", 1));
			YGOProBanListMemoryRepository.findIndexByAlias("edison");

			expect(warnSpy).not.toHaveBeenCalled();
		});

		describe.each([
			[
				"A added before B",
				(a: YGOProBanList, b: YGOProBanList) => {
					YGOProBanListMemoryRepository.add(a);
					YGOProBanListMemoryRepository.add(b);
				},
			],
			[
				"B added before A",
				(a: YGOProBanList, b: YGOProBanList) => {
					YGOProBanListMemoryRepository.add(b);
					YGOProBanListMemoryRepository.add(a);
				},
			],
		])("resolution independent of insertion order (%s)", (_label, insert) => {
			it("resolves an alias-field exact match, and a name-substring query with no alias/name match, to the correct list", () => {
				const jtp = makeBanList("JTP", 1, "jtp");
				const jtpAdv = makeBanList("JTP Adv 2007-03", 2, "jtp-adv-2007-03");
				insert(jtp, jtpAdv);

				expect(YGOProBanListMemoryRepository.findByAlias("jtp")).toBe(jtp);
				expect(YGOProBanListMemoryRepository.findByAlias("adv2007-03")).toBe(jtpAdv);
			});

			it("breaks a substring tie by shortest normalized name when neither an alias nor an exact name matches", () => {
				const warnSpy = jest
					.spyOn(LoggerFactory.getLogger(), "warn")
					.mockImplementation(() => undefined);
				const shorter = makeBanList("2026.04 Tengu", 1);
				const longer = makeBanList("2026.04 Tengu Community Edition", 2);
				insert(shorter, longer);

				expect(YGOProBanListMemoryRepository.findByAlias("tengu")).toBe(shorter);
				expect(YGOProBanListMemoryRepository.findByAlias("tengu")).toBe(shorter);

				expect(warnSpy).toHaveBeenCalledTimes(1);
			});
		});

		it("resolves the alias field even when a name-substring match would pick a different list", () => {
			// "goat" is a substring of both names below; without the alias-field
			// check the shorter (substring-tie-break) name would win instead.
			const decoy = makeBanList("Goat Legacy Format", 1);
			const target = makeBanList("2026.01 Goat Community", 2, "goat");

			YGOProBanListMemoryRepository.add(decoy);
			YGOProBanListMemoryRepository.add(target);

			expect(YGOProBanListMemoryRepository.findByAlias("goat")).toBe(target);
		});

		it("resolves a base-pool list with no alias via existing name-based matching", () => {
			YGOProBanListMemoryRepository.add(makeBanList("2026.04 Edison Format", 1));

			expect(YGOProBanListMemoryRepository.findIndexByAlias("edison")).toBe(0);
		});

		// The shipping corpus (resources/current/ygopro) has exactly one banlist
		// whose normalized name contains each of these aliases, so alias-field
		// resolution and the substring tie-break both agree with plain
		// exact/substring matching — this pins that today's real aliases resolve
		// to the same list before and after the alias field and tie-break exist.
		it("resolves today's real format aliases unambiguously", () => {
			const md = makeBanList("2026.03 MD", 1, "md");
			const edison = makeBanList("2010.03 Edison", 2, "edison");
			const tengu = makeBanList("2011.09 Tengu", 3, "tengu");
			const jtp = makeBanList("JTP", 4, "jtp");
			const genesys = makeBanList("Genesys", 5, "genesys");
			const world = makeBanList("2026.05 Worlds", 6, "world");

			YGOProBanListMemoryRepository.add(md);
			YGOProBanListMemoryRepository.add(edison);
			YGOProBanListMemoryRepository.add(tengu);
			YGOProBanListMemoryRepository.add(jtp);
			YGOProBanListMemoryRepository.add(genesys);
			YGOProBanListMemoryRepository.add(world);

			expect(YGOProBanListMemoryRepository.findByAlias("md")).toBe(md);
			expect(YGOProBanListMemoryRepository.findByAlias("edison")).toBe(edison);
			expect(YGOProBanListMemoryRepository.findByAlias("tengu")).toBe(tengu);
			expect(YGOProBanListMemoryRepository.findByAlias("jtp")).toBe(jtp);
			expect(YGOProBanListMemoryRepository.findByAlias("genesys")).toBe(genesys);
			expect(YGOProBanListMemoryRepository.findByAlias("world")).toBe(world);
		});
	});

	describe("getFirstTCGIndex", () => {
		it("returns the index of the first banlist whose name includes ' TCG'", () => {
			YGOProBanListMemoryRepository.add(makeBanList("2026.04 OCG", 1));
			YGOProBanListMemoryRepository.add(makeBanList("2026.05 TCG", 2));
			expect(YGOProBanListMemoryRepository.getFirstTCGIndex()).toBe(1);
		});

		it("falls back to 0 when no TCG banlist is loaded", () => {
			YGOProBanListMemoryRepository.add(makeBanList("2026.04 OCG", 1));
			expect(YGOProBanListMemoryRepository.getFirstTCGIndex()).toBe(0);
		});
	});

	describe("getFirstOCGIndex", () => {
		it("returns the index of the first banlist whose name includes ' OCG'", () => {
			YGOProBanListMemoryRepository.add(makeBanList("2026.05 TCG", 1));
			YGOProBanListMemoryRepository.add(makeBanList("2026.04 OCG", 2));
			expect(YGOProBanListMemoryRepository.getFirstOCGIndex()).toBe(1);
		});

		it("falls back to 0 when no OCG banlist is loaded", () => {
			YGOProBanListMemoryRepository.add(makeBanList("2026.05 TCG", 1));
			expect(YGOProBanListMemoryRepository.getFirstOCGIndex()).toBe(0);
		});

		// Mirrors resolveAliasIndex's warn-on-miss pattern (RuleMappings.ts): a
		// silent 0-fallback here mislabels every OCG-list token (otto/oor/or/
		// oomr/omr/ocg/ocgpre/ocgart) with whatever list happens to sit at index
		// 0, with nothing in the logs to explain why. Warn once so the miss is
		// diagnosable without flooding logs on every call.
		it("warns once when falling back to 0 because no OCG banlist is loaded", () => {
			const warnSpy = jest
				.spyOn(LoggerFactory.getLogger(), "warn")
				.mockImplementation(() => undefined);
			YGOProBanListMemoryRepository.add(makeBanList("2026.05 TCG", 1));

			YGOProBanListMemoryRepository.getFirstOCGIndex();
			YGOProBanListMemoryRepository.getFirstOCGIndex();

			expect(warnSpy).toHaveBeenCalledTimes(1);
			expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("OCG"));
		});

		it("does NOT warn when an OCG banlist is loaded", () => {
			const warnSpy = jest
				.spyOn(LoggerFactory.getLogger(), "warn")
				.mockImplementation(() => undefined);
			YGOProBanListMemoryRepository.add(makeBanList("2026.04 OCG", 1));

			YGOProBanListMemoryRepository.getFirstOCGIndex();

			expect(warnSpy).not.toHaveBeenCalled();
		});
	});
});
