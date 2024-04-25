import { HostInfo } from "./host-info/HostInfo";
import { Mode } from "./host-info/Mode.enum";

function isInt(value: string): boolean {
	const numberValue = parseInt(value, 10);

	return !isNaN(numberValue) && Number.isInteger(numberValue);
}

interface RuleMappings {
	[key: string]: {
		get: (value?: string) => Partial<HostInfo>;
		validate: (value: string) => boolean;
	};
}

export const ruleMappings: RuleMappings = {
	m: {
		get: () => ({ mode: Mode.MATCH, startLp: 8000 }),
		validate: (value) => value === "m" || value === "match",
	},
	t: {
		get: () => ({ mode: Mode.TAG, startLp: 16000 }),
		validate: (value) => value === "t" || value === "tag",
	},
};

export const priorityRuleMappings: RuleMappings = {
	lp: {
		get: (value: string) => {
			const [_, lps] = value.split("lp");
			if (!isInt(lps)) {
				return {
					startLp: 8000,
				};
			}

			const numberValue = parseInt(value, 10);

			if (numberValue <= 0) {
				return {
					startLp: 1,
				};
			}

			if (numberValue >= 99999) {
				return {
					startLp: 99999,
				};
			}

			return {
				startLp: +lps,
			};
		},
		validate: (value) => {
			const regex = /^lp\d+$/;

			return regex.test(value);
		},
	},

	tm: {
		get: (value: string) => {
			const [_, time] = value.split("tm");
			const numberValue = parseInt(time, 10);

			if (numberValue >= 1 && numberValue <= 60) {
				return {
					timeLimit: numberValue * 60,
				};
			}

			if (numberValue >= 999) {
				return {
					timeLimit: 999,
				};
			}

			return {
				timeLimit: +time,
			};
		},
		validate: (value) => {
			const regex = /^(tm|tiem)\d+$/;

			return regex.test(value);
		},
	},

	mr: {
		get: (value: string) => {
			const [_, duelRule] = value.split("mr");
			const duelRuleValue = +duelRule;

			return {
				duelRule: duelRuleValue,
			};
		},
		validate: (value) => {
			const regex = /^(mr|duelrule)\d+$/;

			return regex.test(value);
		},
	},

	ot: {
		get: () => ({ rule: 5 }),
		validate: (value) => {
			return value === "ot" || value === "tcg";
		},
	},

	ns: {
		get: () => {
			return {
				noShuffle: true,
			};
		},
		validate: (value) => {
			return value === "ns" || value === "noshuffle";
		},
	},
};
