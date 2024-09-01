/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import * as lzma from "lzma-native";
import { promisify } from "util";

import { UTF8ToUTF16 } from "../../utils/UTF8ToUTF16";
import { Client } from "../client/domain/Client";

// eslint-disable-next-line @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-member-access
const lzmaCompress = promisify(lzma.compress);

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
		this._data.writeUInt32LE(value, this.offset);
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

	get data(): Buffer {
		return this._data;
	}
}

export class Replay {
	private _seed: bigint[] = [BigInt(0), BigInt(0), BigInt(0), BigInt(0)];
	private _messages: Buffer[] = [];
	private _responses: Buffer[] = [];
	private _players: Client[] = [];
	private _extraCards = [];
	private readonly startingLp: number;
	private readonly startingDrawCount: number;
	private readonly drawCountPerTurn: number;
	private readonly flags: bigint;

	constructor({
		startingLp,
		startingDrawCount,
		drawCountPerTurn,
		flags,
	}: {
		startingLp: number;
		startingDrawCount: number;
		drawCountPerTurn: number;
		flags: bigint;
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

	setSeed(seed: bigint[]): void {
		this._seed = seed;
	}

	addMessage(message: Buffer): void {
		this._messages.push(message);
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

	// eslint-disable-next-line @typescript-eslint/require-await
	async compressData(data: Buffer): Promise<Buffer> {
		// eslint-disable-next-line @typescript-eslint/no-unsafe-return
		return lzmaCompress(data, {
			preset: 5,
			dictSize: 1 << 24,
		});
	}

	async compress(buffer: Buffer): Promise<Buffer> {
		return new Promise<Buffer>((resolve, reject) => {
			const encoder = lzma.createStream("rawEncoder", {
				filters: [
					{
						id: lzma.FILTER_LZMA1,
						options: { preset: 5, dict_size: 1 << 24 },
					},
				],
			});

			const chunks: Buffer[] = [];

			encoder.on("data", (chunk: Buffer) => {
				chunks.push(chunk);
			});

			encoder.on("end", () => {
				const result = Buffer.concat(chunks);
				resolve(result);
			});

			encoder.on("error", (err: Error) => {
				reject(err);
			});

			encoder.write(buffer);
			encoder.end();
		});
	}

	async serialize(): Promise<Buffer> {
		/* yrp */
		const size = this.yrppHeaderSize() + 72 + 1;
		const replayBuffer = new ReplayBuffer({ size });
		replayBuffer.writeUInt8(231);
		const header = this.buildReplayHeader();
		this.writeHeader(header, replayBuffer);
		this.writePlayers(replayBuffer);
		replayBuffer.writeUInt32(this.startingLp);
		replayBuffer.writeUInt32(this.startingDrawCount);
		replayBuffer.writeUInt32(this.drawCountPerTurn);
		replayBuffer.writeUInt64(BigInt(this.flags));
		this.writeDecks(replayBuffer);
		replayBuffer.writeUInt32(0); //TODO: EXTRA CARDS COUNT
		this.writeResponses(replayBuffer);

		this._messages.push(replayBuffer.data);

		/* yrpx */
		const yrpxHeaderSize = this.yrpxHeaderSize();
		const yrpxReplayBuffer = new ReplayBuffer({ size: yrpxHeaderSize });
		this.writePlayers(yrpxReplayBuffer);
		yrpxReplayBuffer.writeUInt64(BigInt(this.flags));
		this.writeMessages(yrpxReplayBuffer);
		const yrpxReplayHeader = this.buildExtendedReplayHeader(yrpxReplayBuffer);

		/* lzma */
		const compressedData = await this.compress(yrpxReplayBuffer.data);
		yrpxReplayHeader.base.flags |= ReplayFlags.REPLAY_COMPRESSED;
		const compressedBuffer = new ReplayBuffer({ size: 72 + compressedData.length });
		this.writeHeader(yrpxReplayHeader, compressedBuffer);
		compressedBuffer.writeBuffer(compressedData);

		return compressedBuffer.data;
	}

	destroy(): void {
		this._players.forEach((item) => {
			item.socket.removeAllListeners();
		});
	}

	reset(): void {
		this._players = [];
		this._messages = [];
		this._responses = [];
		this._extraCards = [];
	}

	private buildExtendedReplayHeader(buffer: ReplayBuffer): ExtendedReplayHeader {
		const header: ExtendedReplayHeader = {
			base: {
				type: ReplayTypes.REPLAY_YRPX,
				version: 655656,
				flags:
					ReplayFlags.REPLAY_LUA64 |
					ReplayFlags.REPLAY_64BIT_DUELFLAG |
					ReplayFlags.REPLAY_NEWREPLAY |
					ReplayFlags.REPLAY_EXTENDED_HEADER,
				timestamp: Math.floor(Date.now() / 1000),
				size: buffer.data.length,
				hash: 0,
				props: new Uint8Array([93, 0, 0, 0, 1, 0, 0, 0]),
			},
			version: BigInt(1),
			seed: [BigInt(0), BigInt(0), BigInt(0), BigInt(0)],
		};

		return header;
	}

	private buildReplayHeader(): ExtendedReplayHeader {
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

	private writeHeader(header: ExtendedReplayHeader, buffer: ReplayBuffer): void {
		buffer.writeUInt32(header.base.type);
		buffer.writeUInt32(header.base.version);
		buffer.writeUInt32(header.base.flags);
		buffer.writeUInt32(header.base.timestamp);
		buffer.writeUInt32(header.base.size);
		buffer.writeUInt32(header.base.hash);
		buffer.writeUInt8(header.base.props[0]);
		buffer.writeUInt8(header.base.props[1]);
		buffer.writeUInt8(header.base.props[2]);
		buffer.writeUInt8(header.base.props[3]);
		buffer.writeUInt8(header.base.props[4]);
		buffer.writeUInt8(header.base.props[5]);
		buffer.writeUInt8(header.base.props[6]);
		buffer.writeUInt8(header.base.props[7]);
		buffer.writeUInt64(header.version);
		buffer.writeUInt64(header.seed[0]);
		buffer.writeUInt64(header.seed[1]);
		buffer.writeUInt64(header.seed[2]);
		buffer.writeUInt64(header.seed[3]);
	}

	private writeMessages(buffer: ReplayBuffer): void {
		for (const message of this._messages) {
			const messageSize = message.length - 1;
			buffer.writeUInt8(message[0]);
			buffer.writeUInt32(messageSize);
			buffer.writeBuffer(message.subarray(1, message.length));
		}
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
