// STOC acknowledgement for an express (token) reconnect attempt.
// Wire format: [2b size LE][0xfd][status]. status 0x00 = success, 0x01 = failure.
// On failure the caller also destroys the socket (see ExpressReconnectHandler and
// the per-phase EXPRESS_RECONNECT listeners).
export class ReconnectionAckMessage {
	private static build(status: number): Buffer {
		const data = Buffer.from([0xfd, status]);
		const size = Buffer.alloc(2);
		size.writeUint16LE(data.length);

		return Buffer.concat([size, data]);
	}

	static success(): Buffer {
		return this.build(0x00);
	}

	static failure(): Buffer {
		return this.build(0x01);
	}
}
