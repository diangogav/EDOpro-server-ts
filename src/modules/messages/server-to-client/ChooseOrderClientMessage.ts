export class ChooseOrderClientMessage {
	static create(): Buffer {
		const header = Buffer.from([0x01, 0x00, 0x04]);

		return Buffer.concat([header]);
	}
}
