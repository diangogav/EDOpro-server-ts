export class TypeChangeClientMessage {
	static create({ type = 0x00 }: { type?: number }): Buffer {
		const header = Buffer.from([0x2, 0x00, 0x13]);

		return Buffer.concat([header, Buffer.from([type])]);
	}
}
