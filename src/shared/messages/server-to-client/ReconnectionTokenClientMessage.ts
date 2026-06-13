// STOC frame that delivers a reconnection token to a single player's socket.
// Wire format: [2b size LE][0xfd][token utf8]. Opcode 0xfd is the EDOpro
// reconnection standard and is shared verbatim by both subtrees (TCP + WS).
export class ReconnectionTokenClientMessage {
	static create(token: string): Buffer {
		const type = Buffer.from([0xfd]);
		const tokenBuffer = Buffer.from(token, "utf8");
		const data = Buffer.concat([type, tokenBuffer]);
		const size = Buffer.alloc(2);
		size.writeUint16LE(data.length);

		return Buffer.concat([size, data]);
	}
}
