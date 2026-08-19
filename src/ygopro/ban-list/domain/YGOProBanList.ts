import { BanList } from "src/shared/ban-list/BanList";

export class YGOProBanList extends BanList {
	private _alias: string | null = null;

	setHash(hash: number) {
		this._hash = hash;
	}

	/**
	 * The alias is the canonical directory name a format banlist was loaded
	 * from (e.g. "jtp" for formats/jtp/lflist.conf), stored normalized to
	 * lowercase. Lists loaded outside a formats/<alias>/ directory (e.g. the
	 * base pool) have no alias.
	 */
	setAlias(alias: string): void {
		this._alias = alias.toLowerCase();
	}

	get alias(): string | null {
		return this._alias;
	}

	/**
	 * Recomputes the list hash the way a ygopro-family client computes it for a
	 * whitelist list, replacing the one the lflist library supplied.
	 *
	 * Two divergences make the library hash unusable here. It parses only limit
	 * 0-2 entries, so it ignores the thousands of 3-copy rows a whitelist has to
	 * enumerate; and clients that support `$whitelist` fold 0x0f0f0f0f into the
	 * hash when they see the directive. The result matches no client at all: a
	 * room hosted with a whitelist list shows up as "Unknown Banlist".
	 *
	 * Scoped to the ygopro protocol on purpose. EDOPro parses the directive but
	 * leaves its hash alone, so its side must keep the library value.
	 *
	 * XOR is commutative, so bucket order does not matter.
	 */
	recomputeWhitelistHash(): void {
		const buckets: [number[], number][] = [
			[this.forbidden, 0],
			[this.limited, 1],
			[this.semiLimited, 2],
			[this.all, 3],
		];

		let hash = 0x7dfcee6a;
		for (const [cardIds, quantity] of buckets) {
			for (const cardId of cardIds) {
				hash =
					hash ^
					((((cardId >>> 0) << 18) >> 0) | (cardId >> 14)) ^
					((((cardId >>> 0) << (27 + quantity)) >>> 0) | (cardId >>> (5 - quantity)));
			}
		}

		this._hash = (hash ^ 0x0f0f0f0f) >>> 0;
	}

	add(cardId: number, quantity: number, points?: number): void {
		switch (quantity) {
			case 0:
				this.forbidden.push(cardId);
				break;
			case 1:
				this.limited.push(cardId);
				break;
			case 2:
				this.semiLimited.push(cardId);
				break;
			default:
				this.all.push(cardId);
				break;
		}

		if (points !== undefined && !isNaN(points)) {
			this.points.set(cardId, points);
		}
	}
}
