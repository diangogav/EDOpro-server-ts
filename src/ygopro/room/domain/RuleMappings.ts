import MercuryBanListMemoryRepository from "../../ban-list/infrastructure/YGOProBanListMemoryRepository";
import { GameMode } from "ygopro-msg-encode";
import { HostInfo } from "./host-info/HostInfo";

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
		get: () => ({ mode: GameMode.MATCH, start_lp: 8000, best_of: 3 }),
		validate: (value) => value === "m" || value === "match",
	},
	t: {
		get: () => ({ mode: GameMode.TAG, start_lp: 16000, best_of: 1 }),
		validate: (value) => value === "t" || value === "tag",
	},
};

export const priorityRuleMappings: RuleMappings = {
	bo: {
		get: (value: string) => {
			const best_of = extractNumberFromCommand(value.toString());

			if (best_of === null || best_of < 1) {
				return {
					mode: GameMode.MATCH,
					best_of: 3,
				};
			}

			if (best_of % 2 === 0) {
				return {
					mode: GameMode.MATCH,
					best_of: best_of + 1,
				};
			}

			return {
				best_of,
				mode: GameMode.MATCH,
			};
		},
		validate: (value) => {
			const regex = /^bo\d+$/;

			return regex.test(value);
		},
	},
	lp: {
		get: (value: string) => {
			const lps = extractNumberFromCommand(value);

			if (lps === null) {
				return {
					start_lp: 8000,
				};
			}

			const numberValue = parseInt(value, 10);

			if (numberValue <= 0) {
				return {
					start_lp: 1,
				};
			}

			if (numberValue >= 99999) {
				return {
					start_lp: 99999,
				};
			}

			return {
				start_lp: +lps,
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
					time_limit: 450,
				};
			}

			if (time >= 1 && time <= 60) {
				return {
					time_limit: time * 60,
				};
			}

			if (time >= 999) {
				return {
					time_limit: 999,
				};
			}

			return {
				time_limit: time,
			};
		},
		validate: (value) => {
			const regex = /^(tm|time)\d+$/;

			return regex.test(value);
		},
	},

	mr: {
		get: (value: string) => {
			const duel_rule = extractNumberFromCommand(value);

			if (duel_rule && duel_rule > 0 && duel_rule <= 5) {
				return {
					duel_rule,
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
	// OCG with TCG and OCG cards allowed
	otto: {
		get: () => ({ rule: 5, lflist: 0 }),
		validate: (value) => {
			return value === "otto";
		},
	},
	// TCG with TCG and OCG cards allowed
	toot: {
		get: () => {
			return {
				rule: 5,
				lflist: MercuryBanListMemoryRepository.getFirstTCGIndex(),
			};
		},
		validate: (value) => {
			return value === "toot";
		},
	},

	ns: {
		get: () => {
			return {
				no_shuffle_deck: 1,
			};
		},
		validate: (value) => {
			return value === "ns" || value === "noshuffle";
		},
	},

	nc: {
		get: () => {
			return {
				no_check_deck: 1,
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
					draw_count: 1,
				};
			}

			if (count > 35) {
				return {
					draw_count: 35,
				};
			}

			if (count <= 0) {
				return {
					draw_count: 1,
				};
			}

			return {
				draw_count: count,
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
					start_hand: 5,
				};
			}

			if (count > 40) {
				return {
					start_hand: 40,
				};
			}

			if (count <= 0) {
				return {
					start_hand: 5,
				};
			}

			return {
				start_hand: count,
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
				lflist: MercuryBanListMemoryRepository.getFirstTCGIndex(),
			};
		},
		validate: (value) => {
			return value === "to" || value === "tcgonly" || value === "tor";
		},
	},

	lf: {
		get: (value: string) => {
			const match = value.match(/^(?:lf|lflist)(.+)$/i);
			if (!match) return { lflist: -1 };

			const query = match[1];

			const numericIndex = parseInt(query, 10);
			if (!isNaN(numericIndex) && numericIndex.toString() === query) {
				return { lflist: numericIndex - 1 };
			}

			const aliasIndex = MercuryBanListMemoryRepository.findIndexByAlias(query);

			if (aliasIndex !== -1) {
				return { lflist: aliasIndex };
			}

			return { lflist: 0 };
		},
		validate: (value) => {
			const regex = /^(lf|lflist)(.+)$/i;

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
			return value === "oor" || value === "oo" || value === "ocgonly";
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
				lflist: MercuryBanListMemoryRepository.getFirstTCGIndex(),
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
				mode: GameMode.MATCH,
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
				mode: GameMode.MATCH,
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
				lflist: MercuryBanListMemoryRepository.getFirstTCGIndex(),
				mode: GameMode.MATCH,
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
				lflist: MercuryBanListMemoryRepository.getFirstTCGIndex(),
				mode: GameMode.MATCH,
			};
		},
		validate: (value) => {
			return value === "tmr";
		},
	},
};

export const formatRuleMappings: RuleMappings = {
	edison: {
		get: () => {
			return {
				rule: 5,
				lflist: Math.max(0, MercuryBanListMemoryRepository.findIndexByAlias("edison")),
				duel_rule: 1,
				time_limit: 450,
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
				lflist: Math.max(0, MercuryBanListMemoryRepository.findIndexByAlias("hat")),
				duel_rule: 2,
				time_limit: 450,
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
				lflist: Math.max(0, MercuryBanListMemoryRepository.findIndexByAlias("tengu")),
				duel_rule: 2,
				time_limit: 450,
			};
		},
		validate: (value) => {
			return value === "tengu";
		},
	},
	md: {
		get: () => {
			const index = MercuryBanListMemoryRepository.findIndexByAlias("md");
			return {
				rule: 5,
				lflist: Math.max(0, index),
				duel_rule: 5,
				time_limit: 450,
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
				lflist: Math.max(0, MercuryBanListMemoryRepository.findIndexByAlias("jtp")),
				duel_rule: 2,
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
				lflist: Math.max(0, MercuryBanListMemoryRepository.findIndexByAlias("gx")),
				duel_rule: 1,
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
				lflist: Math.max(0, MercuryBanListMemoryRepository.findIndexByAlias("mdc")),
				duel_rule: 2,
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
				lflist: Math.max(0, MercuryBanListMemoryRepository.findIndexByAlias("goat")),
				duel_rule: 4,
			};
		},
		validate: (value) => {
			return value === "goat";
		},
	},
	genesys: {
		get: (value: string) => {
			let max_deck_points = extractNumberFromCommand(value);

			if (max_deck_points === null) {
				max_deck_points = 100;
			}

			return {
				rule: 1,
				lflist: 0,
				duel_rule: 5,
				max_deck_points,
				time_limit: 450,
			};
		},
		validate: (value) => {
			const regex = /^genesys\d+$/;
			const shorcutRegex = /^g\d+$/;

			return value === "genesys" || value === "g" || shorcutRegex.test(value) || regex.test(value);
		},
	},
	rush: {
		get: () => {
			const index = MercuryBanListMemoryRepository.findIndexByAlias("rush");
			return {
				rule: 5,
				lflist: index !== -1 ? index : 2,
				duel_rule: 4,
			};
		},
		validate: (value) => {
			return value === "rush";
		},
	},
	rushpre: {
		get: () => {
			const index = MercuryBanListMemoryRepository.findIndexByAlias("rush");
			return {
				rule: 5,
				lflist: index !== -1 ? index : 2,
				duel_rule: 4,
			};
		},
		validate: (value) => {
			return value === "rushpre";
		},
	},
	speed: {
		get: () => {
			const index = MercuryBanListMemoryRepository.findIndexByAlias("speed");
			return {
				rule: 5,
				lflist: index !== -1 ? index : 3,
				duel_rule: 4,
			};
		},
		validate: (value) => {
			return value === "speed";
		},
	},
	world: {
		get: () => {
			const index = MercuryBanListMemoryRepository.findIndexByAlias("world");
			return {
				rule: 5,
				lflist: index !== -1 ? index : 5,
				duel_rule: 4,
			};
		},
		validate: (value) => {
			return value === "world";
		},
	},
	pre: {
		get: () => {
			return {
				rule: 5,
				duel_rule: 5,
				time_limit: 450,
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
				lflist: 0,
				time_limit: 450,
			};
		},
		validate: (value) => {
			return value === "ocg";
		},
	},
	tcgpre: {
		get: () => {
			return {
				rule: 5,
				duel_rule: 5,
				time_limit: 450,
			};
		},
		validate: (value) => {
			return value === "tcgpre";
		},
	},
	ocgpre: {
		get: () => {
			return {
				rule: 5,
				duel_rule: 5,
				lflist: 0,
				time_limit: 450,
			};
		},
		validate: (value) => {
			return value === "ocgpre";
		},
	},
	tcgart: {
		get: () => {
			return {
				rule: 5,
				duel_rule: 5,
				time_limit: 450,
			};
		},
		validate: (value) => {
			return value === "tcgart";
		},
	},
	ocgart: {
		get: () => {
			return {
				rule: 5,
				duel_rule: 5,
				lflist: 0,
				time_limit: 450,
			};
		},
		validate: (value) => {
			return value === "ocgart";
		},
	},
};

export const extendedCardPoolFormats = new Set([
	"pre",
	"tcgpre",
	"ocgpre",
	"tcgart",
	"ocgart",
	"rushpre",
]);
