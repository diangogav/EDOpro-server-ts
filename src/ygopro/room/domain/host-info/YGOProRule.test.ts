import { Rule } from "@shared/deck/domain/Rule";

import { YGOProRule, toEdoproRule, ygoproRuleLabel } from "./YGOProRule";

describe("YGOProRule", () => {
	it("labels every card-pool rule with its own meaning", () => {
		expect(ygoproRuleLabel(YGOProRule.OCG)).toBe("OCG");
		expect(ygoproRuleLabel(YGOProRule.TCG)).toBe("TCG");
		expect(ygoproRuleLabel(YGOProRule.SC)).toBe("Simplified Chinese");
		expect(ygoproRuleLabel(YGOProRule.CUSTOM)).toBe("Custom");
		expect(ygoproRuleLabel(YGOProRule.NO_UNIQUE)).toBe("No unique");
		expect(ygoproRuleLabel(YGOProRule.ALL)).toBe("Anything Goes");
	});

	it("labels an unknown rule as anything goes", () => {
		expect(ygoproRuleLabel(9 as YGOProRule)).toBe("Anything Goes");
	});

	it("keeps OCG and TCG when converting to the EDOPro rule", () => {
		expect(toEdoproRule(YGOProRule.OCG)).toBe(Rule.ONLY_OCG);
		expect(toEdoproRule(YGOProRule.TCG)).toBe(Rule.ONLY_TCG);
	});

	it("converts every other rule to the EDOPro anything-goes rule", () => {
		for (const rule of [YGOProRule.SC, YGOProRule.CUSTOM, YGOProRule.NO_UNIQUE, YGOProRule.ALL]) {
			expect(toEdoproRule(rule)).toBe(Rule.ALL);
		}
	});
});
