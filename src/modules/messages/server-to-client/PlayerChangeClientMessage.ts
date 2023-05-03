export class PlayerChangeClientMessage {
	static create({ status = 0x09 }: { status?: number }): Buffer {
		const header = Buffer.from([0x02, 0x00, 0x21]);

		return Buffer.concat([header, Buffer.from([status])]);
	}
}
