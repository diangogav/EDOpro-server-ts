export class DrawClientMessage {
	static create({ buffer }: { buffer: Buffer }): Buffer {
		const header = Buffer.from([0x08, 0x00, 0x01]);

		return Buffer.concat([header, buffer]);
	}
}
