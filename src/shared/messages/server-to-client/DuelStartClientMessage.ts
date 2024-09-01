export class DuelStartClientMessage {
	static create(): Buffer {
		const header = Buffer.from([0x01, 0x00, 0x15]);

		return Buffer.concat([header]);
	}
}
