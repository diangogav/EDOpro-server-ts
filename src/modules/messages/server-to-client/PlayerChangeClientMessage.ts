export class PlayerChangeClientMessage {
	static create(): Buffer {
		const header = Buffer.from([0x02, 0x00, 0x21]);
		const status = Buffer.from([0x09]); //0xA not ready, 0x09 ready

		return Buffer.concat([header, status]);
	}
}
