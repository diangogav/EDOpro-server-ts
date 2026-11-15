/** Builds a payload the way the Ignis core writes one: little-endian, no padding. */
export class IgnisWriter {
	private readonly _bytes: number[] = [];

	public u8(value: number): this {
		this._bytes.push(value & 0xff);
		return this;
	}

	public u16(value: number): this {
		return this.u8(value).u8(value >>> 8);
	}

	public u32(value: number): this {
		return this.u16(value & 0xffff).u16(value >>> 16);
	}

	public u64(value: number): this {
		return this.u32(value % 0x1_0000_0000).u32(Math.floor(value / 0x1_0000_0000));
	}

	/** `[controller][location][sequence:u32][position:u32]`. */
	public location(controller: number, location: number, sequence: number, position: number): this {
		return this.u8(controller).u8(location).u32(sequence).u32(position);
	}

	public build(): Uint8Array {
		return Uint8Array.from(this._bytes);
	}
}
