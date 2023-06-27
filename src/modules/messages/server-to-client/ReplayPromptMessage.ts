export class ReplayPromptMessage {
	static create(): Buffer {
		const header = Buffer.from([0x01, 0x00, 0x17]);

		return Buffer.concat([header]);
	}
}
