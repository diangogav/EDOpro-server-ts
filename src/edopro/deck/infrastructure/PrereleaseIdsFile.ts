import { readFile, stat } from "fs/promises";

import { config } from "src/config";

import { ForeignCounterparts } from "../domain/ForeignCounterparts";

const NO_IDS: ReadonlyMap<number, number> = new Map();

/**
 * The EDOPro code of each unreleased card of the YGOPro pool, read from the
 * file the resources publish. The file is replaced whenever the resources are
 * assembled again, so it is read again when it changes on disk.
 *
 * A file that is missing or cannot be read pairs no card, and one that turns
 * unreadable after a good read keeps the pairs of that read: a deck is then
 * judged as it was before the file existed.
 */
export class PrereleaseIdsFile implements ForeignCounterparts {
	private loaded: { modifiedAt: number; ids: ReadonlyMap<number, number> } | null = null;

	constructor(
		private readonly path: string = `${config.resources.dir}/edopro/prerelease-ids.json`,
	) {}

	public async counterpartOf(code: number): Promise<number | null> {
		return (await this.ids()).get(code) ?? null;
	}

	private async ids(): Promise<ReadonlyMap<number, number>> {
		try {
			const modifiedAt = (await stat(this.path)).mtimeMs;
			if (this.loaded?.modifiedAt !== modifiedAt) {
				this.loaded = { modifiedAt, ids: parseIds(await readFile(this.path, "utf8")) };
			}

			return this.loaded.ids;
		} catch {
			return this.loaded?.ids ?? NO_IDS;
		}
	}
}

function parseIds(text: string): ReadonlyMap<number, number> {
	const parsed = JSON.parse(text) as { ids?: Record<string, unknown> };
	const ids = new Map<number, number>();
	for (const [from, to] of Object.entries(parsed.ids ?? {})) {
		const code = Number(from);
		if (
			Number.isSafeInteger(code) &&
			code > 0 &&
			typeof to === "number" &&
			Number.isSafeInteger(to) &&
			to > 0
		) {
			ids.set(code, to);
		}
	}

	return ids;
}
