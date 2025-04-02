import MercuryBanListMemoryRepository from "../../ban-list/infrastructure/MercuryBanListMemoryRepository";
import { HostInfo } from "./host-info/HostInfo";
import { Mode } from "./host-info/Mode.enum";

interface RuleMappings {
	[key: string]: {
		get: (value?: string) => Partial<HostInfo>;
		validate: (value: string) => boolean;
	};
}

function extractNumberFromCommand(input: string): number | null {
	const match = input.match(/-?\d+(\.\d+)?/);

	return match ? parseFloat(match[0]) : null;
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
			const lps = extractNumberFromCommand(value);

			if (lps === null) {
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
			const time = extractNumberFromCommand(value);
			if (time === null) {
				return {
					timeLimit: 180,
				};
			}

			if (time >= 1 && time <= 60) {
				return {
					timeLimit: time * 60,
				};
			}

			if (time >= 999) {
				return {
					timeLimit: 999,
				};
			}

			return {
				timeLimit: time,
			};
		},
		validate: (value) => {
			const regex = /^(tm|time)\d+$/;

			return regex.test(value);
		},
	},

	mr: {
		get: (value: string) => {
			const duelRule = extractNumberFromCommand(value);

			if (duelRule && duelRule > 0 && duelRule <= 5) {
				return {
					duelRule,
				};
			}

			return {};
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

	nc: {
		get: () => {
			return {
				noCheck: true,
			};
		},
		validate: (value) => {
			return value === "nc" || value === "nocheck";
		},
	},

	dr: {
		get: (value: string) => {
			const count = extractNumberFromCommand(value);

			if (count === null) {
				return {
					drawCount: 1,
				};
			}

			if (count > 35) {
				return {
					drawCount: 35,
				};
			}

			if (count <= 0) {
				return {
					drawCount: 1,
				};
			}

			return {
				drawCount: count,
			};
		},
		validate: (value) => {
			const regex = /^(dr|draw)\d+$/;

			return regex.test(value);
		},
	},

	st: {
		get: (value: string) => {
			const count = extractNumberFromCommand(value);

			if (count === null) {
				return {
					startHand: 5,
				};
			}

			if (count > 40) {
				return {
					startHand: 40,
				};
			}

			if (count <= 0) {
				return {
					startHand: 5,
				};
			}

			return {
				startHand: count,
			};
		},
		validate: (value) => {
			const regex = /^(st|start)\d+$/;

			return regex.test(value);
		},
	},
	to: {
		get: () => {
			return {
				rule: 1,
				lflist: MercuryBanListMemoryRepository.getLastTCGIndex(),
			};
		},
		validate: (value) => {
			return value === "to" || value === "tcgonly" || value === "tor";
		},
	},
	lf: {
		get: (value: string) => {
			const lflist = extractNumberFromCommand(value);
			if (lflist === null) {
				return {
					lflist: -1,
				};
			}

			return {
				lflist: lflist - 1,
			};
		},
		validate: (value) => {
			const regex = /^(lf|lflist)\d+$/;

			return regex.test(value);
		},
	},
	nf: {
		get: () => {
			return {
				lflist: -1,
			};
		},
		validate: (value) => {
			return value === "nf" || value === "nolflist";
		},
	},
	oor: {
		get: () => {
			return {
				rule: 0,
				lflist: 0,
			};
		},
		validate: (value) => {
			return value === "oor";
		},
	},
	or: {
		get: () => {
			return {
				rule: 5,
				lflist: 0,
			};
		},
		validate: (value) => {
			return value === "or";
		},
	},
	tr: {
		get: () => {
			return {
				rule: 5,
				lflist: MercuryBanListMemoryRepository.getLastTCGIndex(),
			};
		},
		validate: (value) => {
			return value === "tr";
		},
	},
	oomr: {
		get: () => {
			return {
				rule: 0,
				lflist: 0,
				mode: Mode.MATCH,
			};
		},
		validate: (value) => {
			return value === "oomr";
		},
	},
	omr: {
		get: () => {
			return {
				rule: 5,
				lflist: 0,
				mode: Mode.MATCH,
			};
		},
		validate: (value) => {
			return value === "omr";
		},
	},
	tomr: {
		get: () => {
			return {
				rule: 1,
				lflist: MercuryBanListMemoryRepository.getLastTCGIndex(),
				mode: Mode.MATCH,
			};
		},
		validate: (value) => {
			return value === "tomr";
		},
	},
	tmr: {
		get: () => {
			return {
				rule: 5,
				lflist: MercuryBanListMemoryRepository.getLastTCGIndex(),
				mode: Mode.MATCH,
			};
		},
		validate: (value) => {
			return value === "tmr";
		},
	},
	edison: {
		get: () => {
			return {
				rule: 5,
				lflist: 0,
				timeLimit: 300,
				duelRule: 1,
				mode: Mode.MATCH,
			};
		},
		validate: (value) => {
			return value === "edison";
		},
	},
	hat: {
		get: () => {
			return {
				rule: 5,
				lflist: 0,
				timeLimit: 300,
				duelRule: 2,
				mode: Mode.MATCH,
			};
		},
		validate: (value) => {
			return value === "hat";
		},
	},
	tengu: {
		get: () => {
			return {
				rule: 5,
				lflist: 0,
				timeLimit: 300,
				duelRule: 2,
				mode: Mode.MATCH,
			};
		},
		validate: (value) => {
			return value === "tengu";
		},
	},
	md: {
		get: () => {
			return {
				rule: 5,
				lflist: 11,
				timeLimit: 300,
				duelRule: 5,
				mode: Mode.MATCH,
			};
		},
		validate: (value) => {
			return value === "md";
		},
	},
	jtp: {
		get: () => {
			return {
				rule: 5,
				lflist: 0,
				timeLimit: 300,
				duelRule: 2,
				mode: Mode.MATCH,
			};
		},
		validate: (value) => {
			return value === "jtp";
		},
	},
	gx: {
		get: () => {
			return {
				rule: 5,
				lflist: 0,
				timeLimit: 300,
				duelRule: 1,
				mode: Mode.MATCH,
			};
		},
		validate: (value) => {
			return value === "gx";
		},
	},
	mdc: {
		get: () => {
			return {
				rule: 5,
				lflist: 0,
				timeLimit: 300,
				duelRule: 2,
				mode: Mode.MATCH,
			};
		},
		validate: (value) => {
			return value === "mdc";
		},
	},
	goat: {
		get: () => {
			return {
				rule: 5,
				lflist: 1,
				timeLimit: 300,
				duelRule: 4,
				mode: Mode.MATCH,
			};
		},
		validate: (value) => {
			return value === "goat";
		},
	},
	rush: {
		get: () => {
			return {
				rule: 5,
				lflist: 2,
				timeLimit: 300,
				duelRule: 4,
				mode: Mode.MATCH,
			};
		},
		validate: (value) => {
			return value === "rush";
		},
	},
	rushpre: {
		get: () => {
			return {
				rule: 5,
				lflist: 2,
				timeLimit: 300,
				duelRule: 4,
				mode: Mode.MATCH,
			};
		},
		validate: (value) => {
			return value === "rushpre";
		},
	},
	speed: {
		get: () => {
			return {
				rule: 5,
				lflist: 3,
				timeLimit: 300,
				duelRule: 4,
				mode: Mode.MATCH,
			};
		},
		validate: (value) => {
			return value === "speed";
		},
	},
	world: {
		get: () => {
			return {
				rule: 5,
				lflist: 5,
				timeLimit: 300,
				duelRule: 4,
				mode: Mode.MATCH,
			};
		},
		validate: (value) => {
			return value === "world";
		},
	},
	pre: {
		get: () => {
			return {
				duelRule: 5,
				timeLimit: 300,
				mode: Mode.MATCH,
			};
		},
		validate: (value) => {
			return value === "pre";
		},
	},
	ocg: {
		get: () => {
			return {
				rule: 0,
				lflist: 19,
				timeLimit: 300,
				mode: Mode.MATCH,
			};
		},
		validate: (value) => {
			return value === "ocg";
		},
	},
};
