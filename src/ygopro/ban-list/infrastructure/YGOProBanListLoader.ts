import { YGOProResourceLoader } from "../../ygopro/YGOProResourceLoader";
import { YGOProBanList } from "../domain/YGOProBanList";
import YGOProBanListMemoryRepository from "./YGOProBanListMemoryRepository";
import { parseBanListEntry } from "src/shared/ban-list/parseBanListEntry";
import LoggerFactory from "src/shared/logger/infrastructure/LoggerFactory";

/**
 * Loads ban lists from lflist.conf files found in ygoproPaths via YGOProResourceLoader
 */
export class YGOProBanListLoader {
	private readonly logger = LoggerFactory.getLogger();
	private readonly _target: YGOProBanList[] | null;
	private readonly _loaded: YGOProBanList[] = [];

	/**
	 * When a target array is provided, parsed banlists are pushed into it instead
	 * of the shared YGOProBanListMemoryRepository. Enables re-callable pure-builder
	 * pattern used by loadYgoproBanLists() for hot-reload (REQ-302).
	 */
	constructor(target?: YGOProBanList[]) {
		this._target = target ?? null;
	}

	/** Returns all banlists parsed by this loader instance. */
	getLoaded(): YGOProBanList[] {
		return this._loaded;
	}

	/**
	 * Normalizes lflist names from library to match expected format.
	 * Converts single-digit months/days to two-digit:
	 * - "2026.1" → "2026.01"
	 * - "2013.3.1" → "2013.03.01"
	 */
	private normalizeName(name: string): string {
		// First handle 3-part format: YYYY.M.D (where M and D can be 1-2 digits)
		let normalized = name.replace(
			/^(\d{4})\.(\d{1,2})\.(\d{1,2})(?:\s+(.+))?$/,
			(match, year, month, day, suffix) => {
				const m = month.padStart(2, "0");
				const d = day.padStart(2, "0");
				return suffix ? `${year}.${m}.${d} ${suffix}` : `${year}.${m}.${d}`;
			},
		);

		// Then handle 2-part format: YYYY.M (where M can be 1-2 digits)
		normalized = normalized.replace(
			/^(\d{4})\.(\d{1,2})(?:\s+(.+))?$/,
			(match, year, month, suffix) => {
				const m = month.padStart(2, "0");
				return suffix ? `${year}.${m} ${suffix}` : `${year}.${m}`;
			},
		);

		return normalized;
	}

	/**
	 * YGOPro lflist.conf uses date-only names for OCG banlists (e.g. "2026.04")
	 * while EDOpro uses "2026.04 OCG". Append " OCG" to date-only names so they
	 * match EDOpro banlist names when mapping edoBanListHash.
	 */
	private appendOcgSuffix(name: string): string {
		if (/^\d{4}\.\d{2}(?:\.\d{2})?$/.test(name)) {
			return `${name} OCG`;
		}
		return name;
	}

	/**
	 * ygopro-lflist-encode only parses entries with limit 0-2.
	 * Whitelist and Genesys banlists also list cards with limit >= 3 (Genesys
	 * cards are always 3 copies) that the library silently discards, along with
	 * their point costs. We parse them from the raw text.
	 */
	private parseUnrestrictedEntries(text: string, banList: YGOProBanList): void {
		for (const line of text.split("\n")) {
			const entry = parseBanListEntry(line);
			if (!entry || entry.limit < 3) {
				continue;
			}
			banList.add(entry.code, entry.limit, entry.points);
		}
	}

	async load(): Promise<void> {
		const loader = YGOProResourceLoader.get();

		this.logger.info("Loading ban lists from YGOPro resources...");

		for await (const { item: lflist, text } of loader.getLFLists()) {
			const normalizedName = this.appendOcgSuffix(this.normalizeName(lflist.name || "Unnamed"));
			const hash = lflist.getHash();

			const banList = new YGOProBanList();
			banList.setName(normalizedName);
			banList.setHash(hash);

			const isWhitelist = text.includes("$whitelist");
			if (isWhitelist) {
				banList.whileListed();
			}

			lflist.entries.forEach((entry) => banList.add(entry.code, entry.limit));

			if (isWhitelist || banList.isGenesys()) {
				this.parseUnrestrictedEntries(text, banList);
			}

			this._loaded.push(banList);

			if (this._target !== null) {
				this._target.push(banList);
			} else {
				YGOProBanListMemoryRepository.add(banList);
			}
		}

		const count =
			this._target !== null ? this._loaded.length : YGOProBanListMemoryRepository.get().length;
		this.logger.info(`Loaded ${count} ban lists`);
	}
}
