import { Rule } from "@shared/deck/domain/Rule";

/**
 * Card-pool rule of a Mercury room (`hostInfo.rule`), numbered as upstream
 * ygopro does. It differs from the EDOPro `allowed` numbering in the shared
 * `Rule` from 2 upward.
 */
export enum YGOProRule {
	OCG = 0,
	TCG = 1,
	SC = 2,
	CUSTOM = 3,
	NO_UNIQUE = 4,
	ALL = 5,
}

/** Availability bits of a card's `ot` in the YGOPro card databases. */
export enum AvailFlag {
	OCG = 0x1,
	TCG = 0x2,
	CUSTOM = 0x4,
	SC = 0x8,
}

/** Bits a card must carry under each rule; 0 skips the check. */
const RULE_AVAIL_FLAGS: Record<YGOProRule, number> = {
	[YGOProRule.OCG]: AvailFlag.OCG,
	[YGOProRule.TCG]: AvailFlag.TCG,
	[YGOProRule.SC]: AvailFlag.SC,
	[YGOProRule.CUSTOM]: AvailFlag.CUSTOM,
	[YGOProRule.NO_UNIQUE]: AvailFlag.OCG | AvailFlag.TCG,
	[YGOProRule.ALL]: 0,
};

const RULE_LABELS: Record<YGOProRule, string> = {
	[YGOProRule.OCG]: "OCG",
	[YGOProRule.TCG]: "TCG",
	[YGOProRule.SC]: "Simplified Chinese",
	[YGOProRule.CUSTOM]: "Custom",
	[YGOProRule.NO_UNIQUE]: "No unique",
	[YGOProRule.ALL]: "Anything Goes",
};

/** Required availability bits for a rule; an unknown rule checks nothing. */
export function availFlagFor(rule: YGOProRule): number {
	return RULE_AVAIL_FLAGS[rule] ?? 0;
}

export function ygoproRuleLabel(rule: YGOProRule): string {
	return RULE_LABELS[rule] ?? RULE_LABELS[YGOProRule.ALL];
}

/**
 * EDOPro `allowed` value for a Mercury rule. The EDOPro client labels a room
 * with system string 1900 + rule and only defines 1900-1904, so a raw 5
 * renders as "???" and never matches the rule filter. OCG and TCG share both
 * numberings; the client has no label for the others, so they map to anything
 * goes.
 */
export function toEdoproRule(rule: YGOProRule): Rule {
	if (rule === YGOProRule.OCG) {
		return Rule.ONLY_OCG;
	}

	if (rule === YGOProRule.TCG) {
		return Rule.ONLY_TCG;
	}

	return Rule.ALL;
}
