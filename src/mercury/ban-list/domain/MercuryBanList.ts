import { BanList } from "src/shared/ban-list/BanList";

export class MercuryBanList extends BanList {
	private _date: string | null;
	private _tcg: boolean

	add(cardId: number, quantity: number): void {
		if (isNaN(cardId) || cardId <= 0 || cardId > 0xffffffffffff) {
			return;
		}

		if (quantity < 0 || quantity > 2) {
			return;
		}

		const hCode = cardId >>> 0;
		this._hash =
			this._hash ^
			((hCode << 18) | (hCode >>> 14)) ^
			((hCode << (27 + quantity)) | (hCode >>> (5 - quantity)));
	}


	setDate(date: string | null): void {
		this._date = date
	}

	get date(): string | null {
		return this._date
	}

	setTCG(isTcg: boolean): void {
		this._tcg = isTcg
	}

	get tcg(): boolean {
		return this._tcg
	}
}