import { YGOProResourceLoader } from "../../ygopro/YGOProResourceLoader";
import { YGOProBanList } from "../domain/YGOProBanList";
import YGOProBanListMemoryRepository from "./MercuryBanListMemoryRepository";
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

  async load(): Promise<void> {
    const loader = YGOProResourceLoader.get();

    this.logger.info("Loading ban lists from YGOPro resources...");

    for await (const lflist of loader.getLFLists()) {
      const normalizedName = this.normalizeName(lflist.name || "Unnamed");
      const hash = lflist.getHash();

      const banList = new YGOProBanList(normalizedName, hash);
      lflist.entries.forEach((entry) => banList.add(entry.code, entry.limit));
      YGOProBanListMemoryRepository.add(banList);
    }

    this.logger.info(
      `Loaded ${YGOProBanListMemoryRepository.get().length} ban lists`,
    );
  }
}
