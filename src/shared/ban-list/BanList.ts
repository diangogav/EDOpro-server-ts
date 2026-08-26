export abstract class BanList {
	abstract add(cardId: number, quantity: number, points?: number): void;

	readonly forbidden: number[] = [];
	readonly limited: number[] = [];
	readonly semiLimited: number[] = [];
	readonly all: number[] = [];
	readonly points = new Map<number, number>();

	/**
	 * Allowances shared across a group of cards, keyed by the list's own
	 * identifier (`legend_monster`, `legend_spell`, `legend_trap` in Rush).
	 *
	 * Unlike forbidden/limited/semiLimited, which cap copies of ONE card, this
	 * caps how much of a category a whole deck may spend.
	 */
	readonly creditLimits = new Map<string, { cap: number; cards: Map<number, number> }>();

	protected _name: string | null = null;
	protected _hash = 0x7dfcee6a;
	private _whitelisted = false;

	setName(name: string): void {
		this._name = this.normalizeName(name);
	}

	get name(): string | null {
		return this._name;
	}

	get hash(): number {
		return this._hash;
	}

	/** Declare a category and how much of it one deck may spend. */
	addCreditLimit(identifier: string, cap: number): void {
		const existing = this.creditLimits.get(identifier);
		if (existing) {
			this.creditLimits.set(identifier, { cap, cards: existing.cards });
			return;
		}
		this.creditLimits.set(identifier, { cap, cards: new Map() });
	}

	/** Tolerates arriving before its cap line — lflist order is not guaranteed. */
	addCreditMember(identifier: string, cardId: number, credit: number): void {
		let limit = this.creditLimits.get(identifier);
		if (!limit) {
			limit = { cap: 1, cards: new Map() };
			this.creditLimits.set(identifier, limit);
		}
		limit.cards.set(cardId, credit);
	}

	whileListed(): void {
		this._whitelisted = true;
	}

	get isWhiteListed(): boolean {
		return this._whitelisted;
	}

	isGenesys(): boolean {
		return this.name === "Genesys";
	}

	normalizeName(raw: string): string | null {
		if (!raw) return null;

		const s = raw.replace(/^!+/, "").trim();
		if (!s) return null;

		const compact = s.replace(/\s+/g, " ");

		// Match YYYY.M.D with optional suffix (e.g. "2013.3.1", "2014.1.1 TCG")
		const md = compact.match(/^(\d{4})[.\-/](\d{1,2})[.\-/](\d{1,2})(?:\s+(.+))?$/);
		if (md) {
			const year = Number(md[1]);
			const month = Number(md[2]);
			const day = Number(md[3]);
			const name = md[4]?.trim().replace(/\s+/g, " ");

			if (!Number.isInteger(year) || year < 1900 || year > 3000) return null;
			if (!Number.isInteger(month) || month < 1 || month > 12) return null;

			const mm = String(month).padStart(2, "0");
			const dd = String(day).padStart(2, "0");
			return name ? `${year}.${mm}.${dd} ${name}` : `${year}.${mm}.${dd}`;
		}

		// Match YYYY.M with optional suffix (e.g. "2026.4", "2026.2 TCG")
		const m = compact.match(/^(\d{4})[.\-/](\d{1,2})(?:\s+(.+))?$/);
		if (m) {
			const year = Number(m[1]);
			const month = Number(m[2]);
			const name = m[3]?.trim().replace(/\s+/g, " ");

			if (!Number.isInteger(year) || year < 1900 || year > 3000) return null;
			if (!Number.isInteger(month) || month < 1 || month > 12) return null;

			const mm = String(month).padStart(2, "0");
			return name ? `${year}.${mm} ${name}` : `${year}.${mm}`;
		}

		return compact;
	}
}
