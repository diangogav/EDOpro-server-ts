import { GameMode } from "ygopro-msg-encode";

import MercuryBanListMemoryRepository from "../../ban-list/infrastructure/YGOProBanListMemoryRepository";
import { YGOProBanList } from "../../ban-list/domain/YGOProBanList";
import LoggerFactory from "src/shared/logger/infrastructure/LoggerFactory";
import {
	formatRuleMappings,
	isRecognizedToken,
	priorityRuleMappings,
	resolveCardPool,
} from "./RuleMappings";
import { DEFAULT_POOL, EXTENDED_POOL } from "src/ygopro/ygopro/PoolSelection";

// isRecognizedToken(token) is the predicate the pairing feature uses to
// decide whether every comma-separated token in a join command is a known
// rule token. True iff the lowercased token matches at least one validate()
// across the three tiers (mode / format / priority).
describe("isRecognizedToken", () => {
	it("recognizes tokens from the mode tier", () => {
		expect(isRecognizedToken("m")).toBe(true);
		expect(isRecognizedToken("tag")).toBe(true);
	});

	it("recognizes tokens from the format tier", () => {
		expect(isRecognizedToken("edison")).toBe(true);
		expect(isRecognizedToken("goat")).toBe(true);
	});

	it("recognizes tokens from the priority tier, including parametric ones", () => {
		expect(isRecognizedToken("tcg")).toBe(true);
		expect(isRecognizedToken("lp8000")).toBe(true);
		expect(isRecognizedToken("bo3")).toBe(true);
	});

	it("is case-insensitive", () => {
		expect(isRecognizedToken("TCG")).toBe(true);
		expect(isRecognizedToken("Edison")).toBe(true);
	});

	it("returns false for unrecognized tokens", () => {
		expect(isRecognizedToken("notarealtoken")).toBe(false);
		expect(isRecognizedToken("salaDeJuan")).toBe(false);
	});

	it('returns false for "casual" — it is handled as a separate league token, not a rule token', () => {
		expect(isRecognizedToken("casual")).toBe(false);
	});

	it("returns false for the blank token", () => {
		expect(isRecognizedToken("")).toBe(false);
	});
});

function createBanList(name: string, hash: number): YGOProBanList {
	const banList = new YGOProBanList();
	banList.setName(name);
	banList.setHash(hash);
	return banList;
}

// Tokens that mean "the OCG list" must resolve via getFirstOCGIndex, not a
// literal 0 — this fixture puts TCG first so a hardcoded-0 regression is
// caught immediately.
describe("OCG-list-meaning lflist tokens resolve via getFirstOCGIndex, not a literal 0", () => {
	const OCG_INDEX = 1;

	beforeEach(() => {
		MercuryBanListMemoryRepository.clear();
		MercuryBanListMemoryRepository.add(createBanList("2026.05 TCG", 100)); // index 0
		MercuryBanListMemoryRepository.add(createBanList("2026.04 OCG", 200)); // index 1
	});

	afterEach(() => {
		MercuryBanListMemoryRepository.clear();
	});

	it.each([
		"otto",
		"oor",
		"or",
		"oomr",
		"omr",
	])('priorityRuleMappings["%s"] resolves lflist to the OCG list index', (key) => {
		const rule = priorityRuleMappings[key].get(key);
		expect(rule.lflist).toBe(OCG_INDEX);
	});

	it.each([
		"ocg",
		"ocgpre",
		"ocgart",
	])('formatRuleMappings["%s"] resolves lflist to the OCG list index', (key) => {
		const rule = formatRuleMappings[key].get(key);
		expect(rule.lflist).toBe(OCG_INDEX);
	});
});

// resolveAliasIndex falls back to index 0 when an alias has no matching
// banlist (mislabeling the room with whatever list sits first) but warns so
// the miss is diagnosable — gx/mdc are dead tokens today because their lists
// are not shipped.
describe("resolveAliasIndex — warns on alias miss instead of silently mislabeling", () => {
	afterEach(() => {
		MercuryBanListMemoryRepository.clear();
		jest.restoreAllMocks();
	});

	it("warns when the gx alias has no matching banlist loaded", () => {
		const warnSpy = jest
			.spyOn(LoggerFactory.getLogger(), "warn")
			.mockImplementation(() => undefined);

		const rule = formatRuleMappings.gx.get("gx");

		expect(rule.lflist).toBe(0);
		expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("gx"));
	});

	it("warns when the mdc alias has no matching banlist loaded", () => {
		const warnSpy = jest
			.spyOn(LoggerFactory.getLogger(), "warn")
			.mockImplementation(() => undefined);

		const rule = formatRuleMappings.mdc.get("mdc");

		expect(rule.lflist).toBe(0);
		expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("mdc"));
	});

	it("does NOT warn when the alias resolves to a real banlist", () => {
		MercuryBanListMemoryRepository.add(createBanList("2026.04 Edison Format", 1));
		const warnSpy = jest
			.spyOn(LoggerFactory.getLogger(), "warn")
			.mockImplementation(() => undefined);

		const rule = formatRuleMappings.edison.get("edison");

		expect(rule.lflist).toBe(0);
		expect(warnSpy).not.toHaveBeenCalled();
	});

	// Memoize per alias so a missing-banlist alias (e.g. "gx"/"mdc") warns once
	// instead of re-warning on every room creation that uses it.
	//
	// Uses "hat" (not "gx"/"mdc", already exercised by the tests above) so
	// this test's outcome doesn't depend on the per-alias memoization state
	// left behind by sibling tests running first.
	it("warns only ONCE per alias even when resolved repeatedly", () => {
		const warnSpy = jest
			.spyOn(LoggerFactory.getLogger(), "warn")
			.mockImplementation(() => undefined);

		formatRuleMappings.hat.get("hat");
		formatRuleMappings.hat.get("hat");
		formatRuleMappings.hat.get("hat");

		expect(warnSpy).toHaveBeenCalledTimes(1);
		expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("hat"));
	});
});

// The clamp must operate on the number extracted via
// extractNumberFromCommand, not a re-parsed parseInt(value) —
// parseInt("lp8000", 10) is NaN, which would silently skip both clamp
// branches (lp0 would leak start_lp 0, lp999999 would leak unclamped).
describe("lp boundary clamps", () => {
	it("clamps lp0 to start_lp 1", () => {
		expect(priorityRuleMappings.lp.get("lp0").start_lp).toBe(1);
	});

	it("clamps lp999999 to start_lp 99999", () => {
		expect(priorityRuleMappings.lp.get("lp999999").start_lp).toBe(99999);
	});

	it("passes an in-range lp8000 through unchanged", () => {
		expect(priorityRuleMappings.lp.get("lp8000").start_lp).toBe(8000);
	});
});

// Sibling tiers (tm/dr/st/bo) compute their clamp checks from the
// extractNumberFromCommand() result, not from a re-parsed raw string, so they
// do not share the lp NaN pitfall above.
describe("sibling boundary clamps (tm/dr/st/bo)", () => {
	it("tm0 passes the extracted 0 through as time_limit (no floor defined)", () => {
		expect(priorityRuleMappings.tm.get("tm0").time_limit).toBe(0);
	});

	it("dr0 clamps to draw_count 1", () => {
		expect(priorityRuleMappings.dr.get("dr0").draw_count).toBe(1);
	});

	it("dr36 clamps to draw_count 35", () => {
		expect(priorityRuleMappings.dr.get("dr36").draw_count).toBe(35);
	});

	it("st0 clamps to start_hand 5", () => {
		expect(priorityRuleMappings.st.get("st0").start_hand).toBe(5);
	});

	it("st41 clamps to start_hand 40", () => {
		expect(priorityRuleMappings.st.get("st41").start_hand).toBe(40);
	});

	it("bo0 defaults to MATCH mode with best_of 3", () => {
		const rule = priorityRuleMappings.bo.get("bo0");
		expect(rule.mode).toBe(GameMode.MATCH);
		expect(rule.best_of).toBe(3);
	});
});

describe("match-mode shortcut mappings", () => {
	// A MATCH shortcut without best_of leaves hostInfo.best_of at the SINGLE
	// default (1), which makes Match.needWins = 1 — functionally a single duel
	// despite mode=MATCH. Every match shortcut must therefore pin best_of.
	it.each(["oomr", "omr", "tomr", "tmr"])('"%s" sets mode MATCH and best_of 3', (key) => {
		const rule = priorityRuleMappings[key].get(key);
		expect(rule.mode).toBe(GameMode.MATCH);
		expect(rule.best_of).toBe(3);
	});
});

describe("jm mapping (jtp best-of-3, used by matchmaking)", () => {
	it("maps the jtp rule set to a best-of-3 match", () => {
		const rule = formatRuleMappings.jm.get("jm");
		expect(rule.mode).toBe(GameMode.MATCH);
		expect(rule.best_of).toBe(3);
		expect(rule.rule).toBe(5);
		expect(rule.duel_rule).toBe(2);
	});

	it("validates only the exact token", () => {
		expect(formatRuleMappings.jm.validate("jm")).toBe(true);
		expect(formatRuleMappings.jm.validate("jmx")).toBe(false);
		expect(formatRuleMappings.jm.validate("jtp")).toBe(false);
	});
});

describe("ed mapping (edison short alias, used by AI duel join commands)", () => {
	it("produces the exact same payload as edison, and pins the full edison rule set", () => {
		// findIndexByAlias is empty under jest (MercuryBanListMemoryRepository has
		// no loaded ban lists), so both edison.get() and ed.get() would silently
		// agree on lflist=-1 even if "ed" typo'd its alias lookup (e.g. "edisonn").
		// Mock a sentinel return so the assertions actually exercise the lookup.
		const findIndex = jest
			.spyOn(MercuryBanListMemoryRepository, "findIndexByAlias")
			.mockReturnValue(7);

		const edison = formatRuleMappings.edison.get("edison");
		const ed = formatRuleMappings.ed.get("ed");

		expect(ed).toEqual(edison);
		expect(ed).toEqual({
			rule: 5,
			lflist: 7,
			duel_rule: 1,
			time_limit: 450,
		});
		expect(findIndex).toHaveBeenCalledWith("edison");

		findIndex.mockRestore();
	});

	it("validates only the exact token", () => {
		expect(formatRuleMappings.ed.validate("ed")).toBe(true);
		expect(formatRuleMappings.ed.validate("edison")).toBe(false);
		expect(formatRuleMappings.ed.validate("edx")).toBe(false);
	});
});

describe("edm mapping (edison best-of-3, used by matchmaking)", () => {
	it("maps the edison rule set to a best-of-3 match", () => {
		const findIndex = jest
			.spyOn(MercuryBanListMemoryRepository, "findIndexByAlias")
			.mockReturnValue(7);

		const rule = formatRuleMappings.edm.get("edm");

		// Same rule set as "edison"/"ed" — MR1 over the open pool with the edison
		// banlist and the 450s clock — plus MATCH + best-of-3 for ranked pairs.
		expect(rule).toEqual({
			rule: 5,
			lflist: 7,
			duel_rule: 1,
			time_limit: 450,
			mode: GameMode.MATCH,
			best_of: 3,
		});
		expect(findIndex).toHaveBeenCalledWith("edison");

		findIndex.mockRestore();
	});

	it("validates only the exact token", () => {
		expect(formatRuleMappings.edm.validate("edm")).toBe(true);
		expect(formatRuleMappings.edm.validate("ed")).toBe(false);
		expect(formatRuleMappings.edm.validate("edison")).toBe(false);
	});
});

describe("jtp-2007-03 mapping (JTP Advanced March 2007)", () => {
	it("maps the historical JTP variant to MR2 over the open JTP pool", () => {
		const findIndex = jest
			.spyOn(MercuryBanListMemoryRepository, "findIndexByAlias")
			.mockReturnValue(7);
		const rule = formatRuleMappings["jtp-2007-03"].get("jtp-2007-03");
		expect(rule.rule).toBe(5);
		expect(rule.duel_rule).toBe(2);
		expect(rule.lflist).toBe(7);
		expect(findIndex).toHaveBeenCalledWith("adv2007-03");
		findIndex.mockRestore();
	});

	it("validates only the exact token", () => {
		expect(formatRuleMappings["jtp-2007-03"].validate("jtp-2007-03")).toBe(true);
		expect(formatRuleMappings["jtp-2007-03"].validate("jtp")).toBe(false);
	});
});

describe("resolveCardPool", () => {
	it("defaults to the standard pool when no option declares one", () => {
		expect(resolveCardPool(["edison", "casual"])).toBe(DEFAULT_POOL);
	});

	it("defaults to the standard pool for an empty option list", () => {
		expect(resolveCardPool([])).toBe(DEFAULT_POOL);
	});

	it("selects the extended pool for prerelease and custom-art tokens", () => {
		for (const token of ["pre", "tcgpre", "ocgpre", "tcgart", "ocgart"]) {
			expect(resolveCardPool([token])).toBe(EXTENDED_POOL);
		}
	});

	it("selects the rush pool for the rush token", () => {
		// Rush cards live in their own pool: base OCG/TCG cards are not part of
		// the format, so they are absent rather than banned.
		expect(resolveCardPool(["rush"])).toBe("rush");
	});

	it("matches tokens case-insensitively", () => {
		expect(resolveCardPool(["RUSH"])).toBe("rush");
	});

	it("takes the first declaring token when options disagree", () => {
		// Deterministic instead of order-dependent-by-accident: a room asking for
		// both rush and prereleases resolves to whichever the host typed first.
		expect(resolveCardPool(["rush", "pre"])).toBe("rush");
		expect(resolveCardPool(["pre", "rush"])).toBe(EXTENDED_POOL);
	});

	it("ignores non-declaring tokens while scanning", () => {
		expect(resolveCardPool(["casual", "tm300", "rush"])).toBe("rush");
	});
});
