import { GameMode } from "ygopro-msg-encode";

import MercuryBanListMemoryRepository from "../../ban-list/infrastructure/YGOProBanListMemoryRepository";
import { formatRuleMappings, priorityRuleMappings } from "./RuleMappings";

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
