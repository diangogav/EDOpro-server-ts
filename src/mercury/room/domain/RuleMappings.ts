import { HostInfo } from "./host-info/HostInfo";
import { Mode } from "./host-info/Mode.enum";

function isInt(value: string): boolean {
	const numberValue = parseInt(value, 10);

	return !isNaN(numberValue) && Number.isInteger(numberValue);
}

interface RuleMappings {
	[key: string]: {
		get: (value?: string) => Partial<HostInfo>;
	};
}

export const ruleMappings: RuleMappings = {
	m: {
		get: () => ({ mode: Mode.MATCH, startLp: 8000 }),
	},
	t: {
		get: () => ({ mode: Mode.TAG, startLp: 16000 }),
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
	},

	tm: {
		get: (value: string) => {
			const [_, tms] = value.split("tm");
			if (!isInt(tms)) {
				return {
					timeLimit: 180,
				};
			}

			const numberValue = parseInt(value, 10);

			if (numberValue <= 0) {
				return {
					timeLimit: 1,
				};
			}

			if (numberValue >= 99999) {
				return {
					timeLimit: 99999,
				};
			}

			return {
				timeLimit: +tms,
			};
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
	},

	ot: {
		get: () => ({ rule: 5 }),
	},
};
