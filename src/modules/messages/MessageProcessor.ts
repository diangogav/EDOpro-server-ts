/* eslint-disable @typescript-eslint/no-misused-promises */
import { Commands } from "./domain/Commands";

export interface ClientMessage {
	data: Buffer;
	previousMessage: Buffer;
	size: number;
	command: Commands;
}

export class MessageProcessor {
	private buffer: Buffer;
	private _size: number;
	private _command: number;
	private _data: Buffer;
	private _previousMessage: Buffer;

	constructor() {
		this.buffer = Buffer.from([]);
		this._data = Buffer.from([]);
	}

	read(data: Buffer): void {
		this.buffer = Buffer.concat([this.buffer, data]);
	}

	process(): void {
		if (!this.isMessageReady()) {
			return;
		}
		if (this._data.length) {
			this._previousMessage = this._data;
		}
		this._size = this.buffer.subarray(0, 2).readUint16LE();
		this._command = this.buffer.subarray(2).readInt8();
		this._data = this.buffer.subarray(3, this._size + 2);
		this.buffer = this.buffer.subarray(this._size + 2);
	}

	isMessageReady(): boolean {
		if (this.buffer.length === 0) {
			return false;
		}
		const messageSize = this.buffer.readInt16LE(0);
		const length = this.buffer.length - 2;

		return length >= messageSize;
	}

	get size(): number {
		return this._size;
	}

	get command(): number {
		return this._command;
	}

	get bufferLength(): number {
		return this.buffer.length;
	}

	get currentBuffer(): Buffer {
		return this.buffer;
	}

	get payload(): ClientMessage {
		return {
			data: this._data,
			size: this.size,
			command: this._command as Commands,
			previousMessage: this._previousMessage,
		};
	}
}
