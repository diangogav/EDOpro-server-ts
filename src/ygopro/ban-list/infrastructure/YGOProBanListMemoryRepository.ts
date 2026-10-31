import { YGOProBanList } from "../domain/YGOProBanList";
import LoggerFactory from "src/shared/logger/infrastructure/LoggerFactory";

const banLists: YGOProBanList[] = [];

// Reset by clear()/replaceAll() so the warning stays scoped to "no OCG list
// currently loaded", not "never warn again for the lifetime of the process".
let hasWarnedMissingOCGList = false;

// Tracked per normalized alias, and reset by clear()/replaceAll(), so an
// ambiguous substring match warns once per alias instead of re-logging the
// same, already-known ambiguity on every lookup.
const warnedAmbiguousSubstringAliases = new Set<string>();

// Loaded names are normalized to zero-padded months ("2026.9 TCG" becomes
// "2026.09 TCG"), so the captured parts compare correctly as strings.
const TCG_LIST_NAME = /^(\d{4})\.(\d{2})(?:\.(\d{2}))? TCG$/;

function normalizeAliasKey(value: string): string {
	return value.toLowerCase().replace(/\s+/g, "");
}

export default {
	add(banList: YGOProBanList): void {
		banLists.push(banList);
	},

	get(): YGOProBanList[] {
		return banLists;
	},

	/**
	 * Returns the index of the most recent dated TCG banlist ("YYYY.MM TCG").
	 * srvpro2 takes the first " TCG" list because the YGOPro lflist.conf lists
	 * the newest first; comparing dates keeps that choice when a newer list
	 * loads later from formats/tcg, before the YGOPro database ships it. On a
	 * tie the first loaded list wins. Falls back to the first list containing
	 * " TCG", then to 0.
	 */
	getNewestTCGIndex(): number {
		let newestIndex = -1;
		let newestDate = "";
		banLists.forEach((list, index) => {
			const match = list.name?.match(TCG_LIST_NAME);
			if (!match) {
				return;
			}
			const date = `${match[1]}.${match[2]}.${match[3] ?? "00"}`;
			if (date > newestDate) {
				newestDate = date;
				newestIndex = index;
			}
		});
		if (newestIndex >= 0) {
			return newestIndex;
		}

		const tcgIndex = banLists.findIndex((list) => list.name && list.name.includes(" TCG"));
		return tcgIndex >= 0 ? tcgIndex : 0;
	},

	/**
	 * Mirror of getNewestTCGIndex — returns the index of the first banlist that
	 * contains " OCG" in its name (the naming convention EDOpro/YGOProBanListLoader
	 * produces for OCG lists, e.g. "2026.04 OCG"). Used by rule tokens that mean
	 * "the OCG list" (otto, oor/ocgonly, or, oomr, omr, ocg, ocgpre, ocgart).
	 * Returns 0 as fallback if no OCG banlist is found, warning once (like
	 * RuleMappings.resolveAliasIndex) instead of silently mislabeling every
	 * room using an OCG-list token.
	 */
	getFirstOCGIndex(): number {
		const ocgIndex = banLists.findIndex((list) => list.name && list.name.includes(" OCG"));
		if (ocgIndex >= 0) {
			return ocgIndex;
		}

		if (!hasWarnedMissingOCGList) {
			hasWarnedMissingOCGList = true;
			LoggerFactory.getLogger().warn(
				'YGOProBanListMemoryRepository.getFirstOCGIndex: no banlist name contains " OCG" — falling back to index 0. Rooms using OCG-list tokens (otto/oor/or/oomr/omr/ocg/ocgpre/ocgart) will be mislabeled with whatever list sits there.',
			);
		}
		return 0;
	},

	findByHash(hash: number): YGOProBanList | null {
		return banLists.find((list) => list.hash === hash) ?? null;
	},

	findByName(name: string): YGOProBanList | null {
		return banLists.find((list) => list.name === name) ?? null;
	},

	findByAlias(alias: string): YGOProBanList | null {
		const index = this.findIndexByAlias(alias);
		return index !== -1 ? banLists[index] : null;
	},

	/**
	 * Resolves an alias to a banlist index, fully deterministic and
	 * independent of load/insertion order:
	 *  1. an exact match on the alias field set at load time (e.g. the
	 *     formats/<alias>/lflist.conf directory name);
	 *  2. an exact normalized-name match;
	 *  3. a substring-inclusion scan over normalized names, tie-broken by
	 *     shortest normalized name, then lexicographically on the normalized
	 *     name.
	 * When the substring scan (step 3) matches more than one list, a warning
	 * names the alias, the chosen winner, and every candidate — so the
	 * ambiguity is diagnosable instead of silent. The warning fires once per
	 * normalized alias.
	 */
	findIndexByAlias(alias: string): number {
		const normalizedAlias = normalizeAliasKey(alias);

		const aliasFieldIndex = banLists.findIndex((list) => list.alias === normalizedAlias);
		if (aliasFieldIndex !== -1) {
			return aliasFieldIndex;
		}

		const exactIndex = banLists.findIndex((list) => {
			if (!list.name) return false;
			return normalizeAliasKey(list.name) === normalizedAlias;
		});
		if (exactIndex !== -1) {
			return exactIndex;
		}

		const substringMatches = banLists
			.map((list, index) => ({ list, index }))
			.filter(({ list }) => {
				if (!list.name) return false;
				return normalizeAliasKey(list.name).includes(normalizedAlias);
			});

		if (substringMatches.length === 0) {
			return -1;
		}

		const [winner] = [...substringMatches].sort((a, b) => {
			const nameA = normalizeAliasKey(a.list.name ?? "");
			const nameB = normalizeAliasKey(b.list.name ?? "");
			if (nameA.length !== nameB.length) {
				return nameA.length - nameB.length;
			}
			return nameA < nameB ? -1 : nameA > nameB ? 1 : 0;
		});

		if (substringMatches.length > 1 && !warnedAmbiguousSubstringAliases.has(normalizedAlias)) {
			warnedAmbiguousSubstringAliases.add(normalizedAlias);
			const winners = substringMatches.map(({ list }) => list.name).join(", ");
			LoggerFactory.getLogger().warn(
				`YGOProBanListMemoryRepository.findIndexByAlias: alias "${alias}" matched ${substringMatches.length} ban lists by substring — using "${winner.list.name}" (shortest normalized name, ties broken lexicographically). Candidates: ${winners}`,
			);
		}

		return winner.index;
	},

	findIndexByHash(hash: number): number {
		return banLists.findIndex((list) => list.hash === hash);
	},

	findLFListByIndex(lflistIndex: number): YGOProBanList | null {
		return banLists[lflistIndex] ?? null;
	},

	clear(): void {
		banLists.length = 0;
		hasWarnedMissingOCGList = false;
		warnedAmbiguousSubstringAliases.clear();
	},

	/**
	 * Atomically replaces the entire banlist array with a new one.
	 * Synchronous in-place swap so no concurrent read observes an empty-list window.
	 */
	replaceAll(next: YGOProBanList[]): void {
		banLists.length = 0;
		banLists.push(...next);
		hasWarnedMissingOCGList = false;
		warnedAmbiguousSubstringAliases.clear();
	},
};
