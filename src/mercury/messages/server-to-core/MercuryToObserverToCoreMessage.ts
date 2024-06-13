export class MercuryToObserverToCoreMessage {
	static create(): Buffer {
		return Buffer.from([0x01, 0x00, 0x21]);
	}
}
