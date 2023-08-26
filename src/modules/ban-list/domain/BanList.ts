export class BanList {
	readonly forbidden: number[] = [];
	readonly limited: number[] = [];
	readonly semiLimited: number[] = [];
	readonly all: number[] = [];
	private _name: string | null = null;
	private _hash = 0x7dfcee6a;
	private _whitelisted = false;

	setName(name: string): void {
		this._name = name;
	}

	get name(): string | null {
		return this._name;
	}

	get hash(): number {
		return this._hash;
	}

	whileListed(): void {
		this._whitelisted = true;
	}

	get isWhiteListed(): boolean {
		return this._whitelisted;
	}

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
}
