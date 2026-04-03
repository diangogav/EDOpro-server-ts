export class JoinGameCoreToClientMessage {
	public static readonly MAX_BYTES_LENGTH: number = 349;
	public readonly banList: number;
	public readonly allowed: number;
	public readonly mode: number;
	public readonly duelRule: number;
	public readonly dontCheckDeckContent: number;
	public readonly dontShuffleDeck: number;
	public readonly offset: number;
	public readonly lp: number;
	public readonly startingHandCount: number;
	public readonly drawCount: number;
	public readonly timeLimit: number;

	constructor(buffer: Buffer) {
		this.banList = buffer.subarray(0, 4).readInt32LE();
		this.allowed = buffer.subarray(4, 5).readUInt8();
		this.mode = buffer.subarray(5, 6).readUInt8();
		this.duelRule = buffer.subarray(6, 7).readUInt8();
		this.dontCheckDeckContent = buffer.subarray(7, 8).readUInt8();
		this.dontShuffleDeck = buffer.subarray(8, 9).readUInt8();
		this.offset = buffer.subarray(9, 12).readUInt8();
		this.lp = buffer.subarray(12, 16).readUInt16LE();
		this.startingHandCount = buffer.subarray(16, 17).readInt8(0);
		this.drawCount = buffer.subarray(17, 18).readInt8(0);
		this.timeLimit = buffer.subarray(18, 20).readUInt16LE(0);
	}
}
