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
