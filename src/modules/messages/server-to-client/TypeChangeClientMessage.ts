export class TypeChangeClientMessage {
	static create(): Buffer {
		const header = Buffer.from([0x2, 0x00, 0x13]);
		const type = Buffer.from([0x00]);

		return Buffer.concat([header, type]);
	}
}
