import { Message } from "../Message";

export class CreateGameMessage implements Message {
	public readonly header: Buffer;
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
	public readonly duelFlagsHight: number;
	public readonly handshake: number;
	public readonly clientVersion: number;
	public readonly t0Count: number;
	public readonly t1Count: number;
	public readonly bestOf: number;
	public readonly duelFlagsLow: number;
	public readonly forbidden: number;
	public readonly extraRules: number;
	public readonly mainDeckMin: number;
	public readonly mainDeckMax: number;
	public readonly extraDeckMin: number;
	public readonly extraDeckMax: number;
	public readonly sideDeckMin: number;
	public readonly sideDeckMax: number;
	public readonly name: string;
	public readonly password: string;
	public readonly notes: string;

	constructor(buffer: Buffer) {
		this.header = buffer.subarray(0, 3);
		this.banList = buffer.subarray(3, 7).readUint32LE();
		this.allowed = buffer.subarray(7, 8).readUInt8();
		this.mode = buffer.subarray(8, 9).readUInt8();
		this.duelRule = buffer.subarray(9, 10).readUInt8();
		this.dontCheckDeckContent = buffer.subarray(10, 11).readUInt8();
		this.dontShuffleDeck = buffer.subarray(11, 12).readUInt8();
		this.offset = buffer.subarray(12, 15).readUInt8();
		this.lp = buffer.subarray(15, 19).readUInt16LE();
		this.startingHandCount = buffer.subarray(17, 18).readInt8(0);
		this.drawCount = buffer.subarray(20, 21).readInt8(0);
		this.timeLimit = buffer.subarray(21, 23).readUInt16LE(0);
		this.duelFlagsHight = buffer.subarray(23, 27).readUInt32LE();
		this.handshake = buffer.subarray(27, 31).readUInt32LE();
		this.clientVersion = buffer.subarray(31, 35).readUInt32LE();
		this.t0Count = buffer.subarray(35, 39).readInt32LE();
		this.t1Count = buffer.subarray(39, 43).readInt32LE();
		this.bestOf = buffer.subarray(43, 47).readInt32LE();
		this.duelFlagsLow = buffer.subarray(47, 51).readUInt32LE();
		this.forbidden = buffer.subarray(51, 55).readUInt32LE();
		this.extraRules = buffer.subarray(55, 57).readUInt16LE();
		this.mainDeckMin = buffer.subarray(57, 59).readUInt16LE();
		this.mainDeckMax = buffer.subarray(59, 61).readUInt16LE();
		this.extraDeckMin = buffer.subarray(61, 63).readUInt16LE();
		this.extraDeckMax = buffer.subarray(63, 65).readUInt16LE();
		this.sideDeckMin = buffer.subarray(65, 67).readUInt16LE();
		this.sideDeckMax = buffer.subarray(67, 69).readUInt16LE();
		this.name = buffer.subarray(69, 109).toString();
		this.password = buffer.subarray(109, 149).toString();
		this.notes = buffer.subarray(149, 349).toString();
	}
}
