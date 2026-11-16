/**
 * Little-endian cursor over a Project Ignis core payload. Every read throws
 * past the end, so a wrong layout fails loudly instead of yielding zeros.
 */
export class IgnisReader {
	private readonly _view: DataView;
	private _offset = 0;

	constructor(bytes: Uint8Array) {
		this._view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
	}

	public get offset(): number {
		return this._offset;
	}

	public get remaining(): number {
		return this._view.byteLength - this._offset;
	}

	public u8(): number {
		const value = this._view.getUint8(this._offset);
		this._offset += 1;
		return value;
	}

	public u16(): number {
		const value = this._view.getUint16(this._offset, true);
		this._offset += 2;
		return value;
	}

	public u32(): number {
		const value = this._view.getUint32(this._offset, true);
		this._offset += 4;
		return value;
	}

	public i32(): number {
		const value = this._view.getInt32(this._offset, true);
		this._offset += 4;
		return value;
	}

	/**
	 * 64-bit value as a JS number. Exact up to 2^53, which covers every effect
	 * description the core emits (card code < 2^32, shifted 20 bits).
	 */
	public u64(): number {
		const low = this.u32();
		const high = this.u32();
		return high * 0x1_0000_0000 + low;
	}

	/**
	 * 64-bit value as its two 32-bit halves, for values that set bits a JS
	 * number cannot hold exactly (announce opcodes live in the top half).
	 */
	public u64Parts(): { low: number; high: number } {
		const low = this.u32();
		const high = this.u32();
		return { low, high };
	}

	public skip(bytes: number): void {
		if (bytes > this.remaining) throw new RangeError("IgnisReader: skip past end");
		this._offset += bytes;
	}
}
