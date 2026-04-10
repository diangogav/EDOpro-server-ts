import { YGOProResourceLoader } from "../../ygopro/YGOProResourceLoader";
import { YGOProBanList } from "../domain/YGOProBanList";
import YGOProBanListMemoryRepository from "./YGOProBanListMemoryRepository";
import LoggerFactory from "src/shared/logger/infrastructure/LoggerFactory";

/**
 * Loads ban lists from lflist.conf files found in ygoproPaths via YGOProResourceLoader
 */
export class YGOProBanListLoader {
  private readonly logger = LoggerFactory.getLogger();

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
   * Whitelist banlists also list unrestricted cards (limit >= 3) that the
   * library silently discards. We parse them from the raw text.
   */
  private parseUnrestrictedEntries(text: string, banList: YGOProBanList): void {
    for (const line of text.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#") || trimmed.startsWith("!") || trimmed.startsWith("$") || trimmed.startsWith("-")) {
        continue;
      }
      const match = trimmed.match(/^(\d+)\s+(\d+)/);
      if (!match) {
        continue;
      }
      const limit = parseInt(match[2], 10);
      if (limit >= 3) {
        banList.add(parseInt(match[1], 10), limit);
      }
    }
  }

  async load(): Promise<void> {
    const loader = YGOProResourceLoader.get();

    this.logger.info("Loading ban lists from YGOPro resources...");

    for await (const { item: lflist, text } of loader.getLFLists()) {
      const normalizedName = this.appendOcgSuffix(
        this.normalizeName(lflist.name || "Unnamed"),
      );
      const hash = lflist.getHash();

      const banList = new YGOProBanList();
      banList.setName(normalizedName);
      banList.setHash(hash);

      const isWhitelist = text.includes("$whitelist");
      if (isWhitelist) {
        banList.whileListed();
      }

      lflist.entries.forEach((entry) => banList.add(entry.code, entry.limit));

      if (isWhitelist) {
        this.parseUnrestrictedEntries(text, banList);
      }

      YGOProBanListMemoryRepository.add(banList);
    }

    this.logger.info(
      `Loaded ${YGOProBanListMemoryRepository.get().length} ban lists`,
    );
  }
}
