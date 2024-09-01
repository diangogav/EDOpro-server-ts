import { TextVO } from "../../../shared/value-objects/TextVO";
import { Message } from "../Message";

export class CreateGameMessage implements Message {
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
		this.duelFlagsHight = buffer.subarray(20, 24).readUInt32LE();
		this.handshake = buffer.subarray(24, 28).readUInt32LE();
		this.clientVersion = buffer.subarray(28, 32).readUInt32LE();
		this.t0Count = buffer.subarray(32, 36).readInt32LE();
		this.t1Count = buffer.subarray(36, 40).readInt32LE();
		this.bestOf = buffer.subarray(40, 44).readInt32LE();
		this.duelFlagsLow = buffer.subarray(44, 48).readUInt32LE();
		this.forbidden = buffer.subarray(48, 52).readUInt32LE();
		this.extraRules = buffer.subarray(52, 54).readUInt16LE();
		this.mainDeckMin = buffer.subarray(54, 56).readUInt16LE();
		this.mainDeckMax = buffer.subarray(56, 58).readUInt16LE();
		this.extraDeckMin = buffer.subarray(58, 60).readUInt16LE();
		this.extraDeckMax = buffer.subarray(60, 62).readUInt16LE();
		this.sideDeckMin = buffer.subarray(62, 64).readUInt16LE();
		this.sideDeckMax = buffer.subarray(64, 66).readUInt16LE();
		this.name = new TextVO(buffer.subarray(66, 106)).value;
		this.password = Buffer.from(new TextVO(buffer.subarray(108, 148)).value).toString("utf16le");
		this.notes = new TextVO(buffer.subarray(148, 548)).value;
	}
}
