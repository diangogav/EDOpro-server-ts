/* eslint-disable no-control-regex */


export interface JSONClientMessage {
	data: string;
	// previousMessage: Buffer;
	size: number;
}

export class JSONMessageProcessor {
	private buffer: Buffer;
	private _size: number;
	private readonly _command: number;
	private _data: string;
	private readonly _previousMessage: Buffer;

	constructor() {
		this.buffer = Buffer.alloc(0);
		this._data = Buffer.alloc(0).toString("utf-8");
	}

	read(data: Buffer): void {
		this.buffer = Buffer.concat([this.buffer, data]);
	}

	process(): void {
		if (!this.isMessageReady()) {
			return;
		}
		if (this._data.length) {
			// this._previousMessage = this._data;
		}
		this._size = this.buffer.readUint16LE(0);
		this._data = this.buffer
			.subarray(2, this._size + 4)
			.toString("utf-8")
			.replace(/^\u0000+/, "");
		this.buffer = this.buffer.subarray(this._size + 4);
	}

	isMessageReady(): boolean {
		if (this.buffer.length === 0) {
			return false;
		}
		const messageSize = this.buffer.readUint16LE(0);
		const length = this.buffer.length - 2;

		return length >= messageSize;
	}

	get size(): number {
		return this._size;
	}

	get bufferLength(): number {
		return this.buffer.length;
	}

	get currentBuffer(): Buffer {
		return this.buffer;
	}

	get payload(): JSONClientMessage {
		return {
			data: this._data,
			size: this.size,
			// previousMessage: this._previousMessage,
		};
	}

	clear(): void {
		this.buffer = Buffer.alloc(0);
		this._size = 0;
		this._data = "";
	}
}
