import net from "net";
import { Writable } from "stream";

export class MyWritable extends Writable {
	private readonly _socket: net.Socket;

	constructor(socket: net.Socket) {
		super();
		this._socket = socket;
	}

	_write(message: Buffer, encoding: string, callback: () => void): void {
		const isWriteSuccessful = this._socket.write(message);

		if (!isWriteSuccessful) {
			console.log("Fallo la escritura...");
			this._socket.once("drain", () => {
				console.log("reintentando...");
				this._write(message, encoding, callback);
			});
		} else {
			callback();
		}
	}
}
