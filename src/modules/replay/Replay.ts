/* eslint-disable @typescript-eslint/unbound-method */
/* eslint-disable @typescript-eslint/no-confusing-void-expression */
/* eslint-disable no-param-reassign */

import { UTF8ToUTF16 } from "../../utils/UTF8ToUTF16";
import { Client } from "../client/domain/Client";

enum ReplayTypes {
	REPLAY_YRP1 = 0x31707279,
	REPLAY_YRPX = 0x58707279,
}

enum ReplayFlags {
	REPLAY_COMPRESSED = 0x1,
	REPLAY_TAG = 0x2,
	REPLAY_DECODED = 0x4,
	REPLAY_SINGLE_MODE = 0x8,
	REPLAY_LUA64 = 0x10,
	REPLAY_NEWREPLAY = 0x20,
	REPLAY_HAND_TEST = 0x40,
	REPLAY_DIRECT_SEED = 0x80,
	REPLAY_64BIT_DUELFLAG = 0x100,
	REPLAY_EXTENDED_HEADER = 0x200,
}

interface ReplayHeader {
	type: ReplayTypes;
	version: number;
	flags: ReplayFlags;
	timestamp: number;
	size: number;
	hash: number;
	props: Uint8Array;
}

interface ExtendedReplayHeader {
	base: ReplayHeader;
	version: bigint;
	seed: bigint[];
}

class ReplayBuffer {
	private offset = 0;
	private readonly _data: Buffer;

	constructor({ size }: { size: number }) {
		this._data = Buffer.alloc(size);
	}

	writeUInt8(value: number): void {
		this._data.writeUInt8(value, this.offset);
		this.offset += 1;
	}

	writeUInt32(value: number): void {
		this._data.writeUInt32LE(value >>> 0, this.offset);
		this.offset += 4;
	}

	writeUInt64(value: bigint): void {
		this._data.writeBigUint64LE(value, this.offset);
		this.offset += 8;
	}

	writeBuffer(value: Buffer): void {
		this.data.set(value, this.offset);
		this.offset += value.length;
	}

	display(): void {
		// eslint-disable-next-line no-console
		console.log(Array.from(this._data, this.toTwoDigitHex).join(" "));
	}

	private toTwoDigitHex(num: number): string {
		const hex = num.toString(16);

		return hex.length === 1 ? `0${hex}` : hex;
	}

	get data(): Buffer {
		return this._data;
	}
}

export class Replay {
	private _seed: bigint[];
	private readonly _messages: Buffer[] = [];
	private readonly _responses: Buffer[] = [];
	private _players: Client[];
	private readonly _extraCards = [];
	private readonly startingLp: number;
	private readonly startingDrawCount: number;
	private readonly drawCountPerTurn: number;
	private readonly flags: number;

	constructor({
		startingLp,
		startingDrawCount,
		drawCountPerTurn,
		flags,
	}: {
		startingLp: number;
		startingDrawCount: number;
		drawCountPerTurn: number;
		flags: number;
	}) {
		this.startingLp = startingLp;
		this.startingDrawCount = startingDrawCount;
		this.drawCountPerTurn = drawCountPerTurn;
		this.flags = flags;
	}

	private static writeUInt32(buffer: Buffer, offset: number, value: number): void {
		buffer.writeUInt32LE(value, offset);
	}

	private static writeUInt8(buffer: Buffer, offset: number, value: number): void {
		buffer.writeUInt8(value, offset);
	}

	setSeed(seed: string[]): void {
		this._seed = [BigInt(seed[0]), BigInt(seed[1]), BigInt(seed[2]), BigInt(seed[3])];
	}

	addMessage(message: Buffer): void {
		this._messages.push(message.subarray(3));
	}

	addResponse(message: string): void {
		const data = message.split("|").map((item) => parseInt(item, 16));
		this._responses.push(Buffer.from(data));
	}

	addPlayers(players: Client[]): void {
		this._players = players;
	}

	yrpxHeaderSize(): number {
		const teamsSize = 8;
		const flagSize = 8;
		const team0Count = this._players.filter((player) => player.team === 0).length;
		const team1Count = this._players.filter((player) => player.team === 1).length;

		const playersSize = 40 * (team0Count + team1Count);

		const messagesSize = this._messages.reduce((size, message) => size + message.length + 4, 0);

		return teamsSize + flagSize + playersSize + messagesSize;
	}

	yrppHeaderSize(): number {
		let size = 0;
		const teamSize = 8;
		const startingLpSize = 8;
		const drawCountPerTurnSize = 4;
		const flagSize = 8;

		size += teamSize + startingLpSize + drawCountPerTurnSize + flagSize;

		const team0Players = this._players.filter((item) => item.team === 0);
		const team1Players = this._players.filter((item) => item.team === 1);

		for (const player of team0Players) {
			size += 40 + 8;
			size += player.deck.main.length * 4;
			size += player.deck.extra.length * 4;
		}

		for (const player of team1Players) {
			size += 40 + 8;
			size += player.deck.main.length * 4;
			size += player.deck.extra.length * 4;
		}

		size += 4 + this._extraCards.length * 4;
		size += this._responses.reduce(
			(responseSize, response) => responseSize + response.length + 1,
			0
		);

		return size;
	}

	serialize(): void {
		const size = this.yrppHeaderSize() + 72 + 1;
		const replayBuffer = new ReplayBuffer({ size });
		replayBuffer.writeUInt8(231);
		const header = this.buildExtendedReplayHeader();
		replayBuffer.writeUInt32(header.base.type);
		replayBuffer.writeUInt32(header.base.version);
		replayBuffer.writeUInt32(header.base.flags);
		replayBuffer.writeUInt32(header.base.timestamp);
		replayBuffer.writeUInt32(header.base.size);
		replayBuffer.writeUInt32(header.base.hash);
		replayBuffer.writeUInt8(header.base.props[0]);
		replayBuffer.writeUInt8(header.base.props[1]);
		replayBuffer.writeUInt8(header.base.props[2]);
		replayBuffer.writeUInt8(header.base.props[3]);
		replayBuffer.writeUInt8(header.base.props[4]);
		replayBuffer.writeUInt8(header.base.props[5]);
		replayBuffer.writeUInt8(header.base.props[6]);
		replayBuffer.writeUInt8(header.base.props[7]);
		replayBuffer.writeUInt64(header.version);
		replayBuffer.writeUInt64(header.seed[0]);
		replayBuffer.writeUInt64(header.seed[1]);
		replayBuffer.writeUInt64(header.seed[2]);
		replayBuffer.writeUInt64(header.seed[3]);

		this.writePlayers(replayBuffer);

		replayBuffer.writeUInt32(this.startingLp);
		replayBuffer.writeUInt32(this.startingDrawCount);
		replayBuffer.writeUInt32(this.drawCountPerTurn);
		replayBuffer.writeUInt64(BigInt(this.flags));

		this.writeDecks(replayBuffer);

		replayBuffer.writeUInt32(0); //TODO: EXTA CARDS COUNT

		this.writeResponses(replayBuffer);

		replayBuffer.display();

		// const buffer = Buffer.alloc(size);

		// const offset = 0;
		// this.writePlayers(buffer, offset);
		// offset += this.yrppHeaderSize();
		// console.log("messages count", this._messages.length);
		// for (const message of this._messages) {
		// 	console.log("message", message);
		// 	Replay.writeUInt8(buffer, offset, message[0]);
		// 	offset += 1;
		// 	const length = message.length - 1;
		// 	Replay.writeUInt32(buffer, offset, length >>> 0);
		// 	offset += 4;
		// 	message.copy(buffer, offset);
		// 	offset += message.length;
		// }

		// const header: ExtendedReplayHeader = {
		// 	base: {
		// 		type: ReplayTypes.REPLAY_YRPX,
		// 		version: 0,
		// 		flags:
		// 			ReplayFlags.REPLAY_LUA64 |
		// 			ReplayFlags.REPLAY_64BIT_DUELFLAG |
		// 			ReplayFlags.REPLAY_NEWREPLAY |
		// 			ReplayFlags.REPLAY_EXTENDED_HEADER,
		// 		timestamp: Math.floor(Date.now() / 1000),
		// 		size: buffer.length,
		// 		hash: 0,
		// 		props: new Uint8Array(8),
		// 	},
		// 	version: 1,
		// 	seed: new Uint32Array(this._seed.map((value) => Number(value) >>> 0)),
		// };

		// const headerBuffer = Buffer.alloc(56);
		// headerBuffer.writeBigUInt64LE(BigInt(header.base.type), 0);

		// Replay.writeUInt32(headerBuffer, 8, header.base.version);
		// Replay.writeUInt32(headerBuffer, 12, header.base.flags);
		// Replay.writeUInt32(headerBuffer, 16, header.base.timestamp);
		// Replay.writeUInt32(headerBuffer, 20, header.base.size);
		// Replay.writeUInt32(headerBuffer, 24, header.base.hash);

		// header.base.props.forEach((value, index) => {
		// 	headerBuffer.writeUInt8(value, 28 + index);
		// });

		// Replay.writeUInt32(headerBuffer, 36, header.version);

		// header.seed.forEach((value, index) => {
		// 	Replay.writeUInt32(headerBuffer, 40 + index * 4, value);
		// });

		// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
		// lzma.compress(buffer, 5).then((response) => {
		// 	console.log("compressed", response);
		// });
		// header.base.flags |= ReplayFlags.REPLAY_COMPRESSED;
		// console.log("buffer", bufferCompressed);
		// console.log(Buffer.concat([headerBuffer, bufferCompressed]));
	}

	private buildExtendedReplayHeader(): ExtendedReplayHeader {
		const header: ExtendedReplayHeader = {
			base: {
				type: ReplayTypes.REPLAY_YRP1,
				version: 655656,
				flags:
					ReplayFlags.REPLAY_LUA64 |
					ReplayFlags.REPLAY_64BIT_DUELFLAG |
					ReplayFlags.REPLAY_NEWREPLAY |
					ReplayFlags.REPLAY_EXTENDED_HEADER,
				timestamp: 0,
				size: this.yrppHeaderSize(),
				hash: 0,
				props: new Uint8Array(),
			},
			version: BigInt(1),
			seed: this._seed,
		};

		return header;
	}

	private writeResponses(buffer: ReplayBuffer): void {
		for (const response of this._responses) {
			buffer.writeUInt8(response.length);
			buffer.writeBuffer(Buffer.from(response));
		}
	}

	private writeDecks(buffer: ReplayBuffer): void {
		const team0Players = this._players.filter((item) => item.team === 0);
		const team1Players = this._players.filter((item) => item.team === 1);

		for (const player of team0Players) {
			buffer.writeUInt32(player.deck.main.length);
			for (const card of player.deck.main) {
				buffer.writeUInt32(Number(card.code));
			}
			buffer.writeUInt32(player.deck.extra.length);
			for (const card of player.deck.extra) {
				buffer.writeUInt32(Number(card.code));
			}
		}

		for (const player of team1Players) {
			buffer.writeUInt32(player.deck.main.length);
			for (const card of player.deck.main) {
				buffer.writeUInt32(Number(card.code));
			}
			buffer.writeUInt32(player.deck.extra.length);
			for (const card of player.deck.extra) {
				buffer.writeUInt32(Number(card.code));
			}
		}
	}

	private writePlayers(buffer: ReplayBuffer): void {
		const team0Players = this._players.filter((item) => item.team === 0);
		const team1Players = this._players.filter((item) => item.team === 1);

		buffer.writeUInt32(team0Players.length);

		for (const player of team0Players) {
			const name = UTF8ToUTF16(player.name, 40);
			buffer.writeBuffer(name);
		}

		buffer.writeUInt32(team1Players.length);

		for (const player of team1Players) {
			const name = UTF8ToUTF16(player.name, 40);
			buffer.writeBuffer(name);
		}
	}
}
