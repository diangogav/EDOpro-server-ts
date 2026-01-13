import { BanList } from "src/shared/ban-list/BanList";

export class EdoproBanList extends BanList {
	add(cardId: number, quantity: number): void {
		if (isNaN(cardId)) {
			return;
		}

		if (quantity === 0) {
			this.forbidden.push(cardId);
		}

		if (quantity === 1) {
			this.limited.push(cardId);
		}

		if (quantity === 2) {
			this.semiLimited.push(cardId);
		}

		if (quantity === 3) {
			this.all.push(cardId);
		}

		this._hash =
			this._hash ^
			((((cardId >>> 0) << 18) >> 0) | (cardId >> 14)) ^
			((((cardId >>> 0) << (27 + quantity)) >>> 0) | (cardId >>> (5 - quantity)));
	}

	isGenesys(): boolean {
		return this.name === "Genesys";
	}
}
