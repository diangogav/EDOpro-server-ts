export class RPSChooseClientMessage {
	static create(): Buffer {
		const header = Buffer.from([0x01, 0x00, 0x03]);

		return Buffer.concat([header]);
	}
}
