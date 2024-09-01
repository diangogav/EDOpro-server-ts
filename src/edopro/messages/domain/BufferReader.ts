export class BufferReader {
	private readonly HEADER_BYTES_LENGTH = 3;
	private _data: Buffer;
	private messageLength: number;

	constructor(data: Buffer) {
		this._data = data;
	}

	get data(): Buffer {
		return this._data;
	}

	IsDataEmpty(): boolean {
		return this._data.length === 0;
	}

	readHeader(): Buffer {
		this.messageLength = Buffer.from([this.data[0], this.data[1]]).readUInt16LE() - 1;
		const header = this._data.subarray(0, this.HEADER_BYTES_LENGTH);
		this._data = this._data.subarray(this.HEADER_BYTES_LENGTH, this._data.length);

		return header;
	}

	readBody(maxBytesLength: number): Buffer {
		const body = this._data.subarray(0, maxBytesLength);
		this._data = this._data.subarray(maxBytesLength, this._data.length);

		return body;
	}

	get length(): number {
		return this.messageLength;
	}
}
