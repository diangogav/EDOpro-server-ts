export class BufferReader {
	private readonly HEADER_BYTES_LENGTH = 3;

	private data: Buffer;

	constructor(data: Buffer) {
		this.data = data;
	}

	IsDataEmpty(): boolean {
		return this.data.length === 0;
	}

	readHeader(): Buffer {
		const header = this.data.subarray(0, this.HEADER_BYTES_LENGTH);
		this.data = this.data.subarray(this.HEADER_BYTES_LENGTH, this.data.length);

		return header;
	}

	readBody(maxBytesLength: number): Buffer {
		const body = this.data.subarray(0, maxBytesLength);
		this.data = this.data.subarray(maxBytesLength, this.data.length);

		return body;
	}
}
