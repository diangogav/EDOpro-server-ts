import { BanList } from "src/shared/ban-list/BanList";


export class YGOProBanList extends BanList {
	setHash(hash: number) {
		this._hash = hash;
	}

	add(cardId: number, quantity: number): void {
		switch (quantity) {
			case 0:
				this.forbidden.push(cardId);
				break;
			case 1:
				this.limited.push(cardId);
				break;
			case 2:
				this.semiLimited.push(cardId);
		}
	}
}
