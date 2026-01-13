export abstract class BanList {
  abstract add(cardId: number, quantity: number): void;

	readonly forbidden: number[] = [];
	readonly limited: number[] = [];
	readonly semiLimited: number[] = [];
	readonly all: number[] = [];
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

    const m = compact.match(/^(\d{4})[.\-/](\d{1,2})\s+(.+)$/);
    if (m) {
      const year = Number(m[1]);
      const month = Number(m[2]);
      const name = m[3].trim().replace(/\s+/g, " ");

      if (!Number.isInteger(year) || year < 1900 || year > 3000) return null;
      if (!Number.isInteger(month) || month < 1 || month > 12) return null;
      if (!name) return null;

      const mm = String(month).padStart(2, "0");
      return `${year}.${mm} ${name}`;
    }

    return compact;
  }
}
