import { EXTENDED_POOL } from "@ygopro/ygopro/PoolSelection";
import { YGOProResourceLoader } from "@ygopro/ygopro/YGOProResourceLoader";

/**
 * The original of a card of the YGOPro pool, for a room of another flow that
 * received it in a deck. The extended pool is read because it holds every
 * printing a client of this flow can build with.
 *
 * The database stores the original in one column; the reader splits it by
 * distance. An alternate artwork keeps it as `alias`, and a card that is far
 * from its original (this project's own pre-errata copies) carries it as
 * `ruleCode` with no alias. Either one is the original.
 */
export class YGOProForeignPrintings {
	public async originalOf(code: number): Promise<number | null> {
		const read = await YGOProResourceLoader.get().getPoolCardReader(EXTENDED_POOL);
		const card = read(code);
		const original = card?.alias || card?.ruleCode || 0;

		return original > 0 ? original : null;
	}
}
