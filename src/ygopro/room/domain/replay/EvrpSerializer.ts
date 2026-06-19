/**
 * EvrpSerializer — build the match-level .evrp envelope and chunk it into
 * STOC_EVRP_EXPORT wire frames.
 *
 * Design decisions:
 *  - D3: ONE .evrp per MATCH (duels[] array holds all per-game frame sets).
 *  - D5: chunks ≤ EVRP_CHUNK_BYTES (48 KiB) with manual wire-format header
 *        [len:2 LE][0xF0][version:u8][index:u16 LE][count:u16 LE][payload].
 *
 * See design D3, D5 and spec R1 for full rationale.
 */

import { gzipSync } from "node:zlib";
import { DuelRecord } from "../DuelRecord";
import { EVRP_CHUNK_BYTES, EVRP_VERSION, STOC_EVRP_EXPORT } from "./evrp-constants";

/** Minimal room shape required by the serializer (no circular dep on YGOProRoom). */
export interface EvrpRoomContext {
	players: ReadonlyArray<{ name: string }>;
	hostInfo: object;
}

/**
 * Versioned .evrp envelope (matches the JSON schema stored inside the gzip).
 * @internal — exported for test assertions only.
 */
export interface EvrpEnvelope {
	version: number;
	meta: {
		players: Array<{ name: string }>;
		hostInfo: object;
		startTime: string;
		endTime: string;
	};
	duels: Array<{
		seed: number[];
		startTime: string;
		endTime: string | undefined;
		winPosition: number | undefined;
		winReason: number | undefined;
		frames: string[];
	}>;
}

export class EvrpSerializer {
	/**
	 * Build the gzip-compressed envelope for one MATCH.
	 *
	 * @param room  - Room context (players + hostInfo).
	 * @param records - All DuelRecord instances from the match (one per game).
	 * @returns Gzipped JSON buffer ready for chunking via `toFrames`.
	 */
	static serialize(room: EvrpRoomContext, records: DuelRecord[]): Buffer {
		const now = new Date().toISOString();

		const envelope: EvrpEnvelope = {
			version: EVRP_VERSION,
			meta: {
				players: room.players.map((p) => ({ name: p.name })),
				hostInfo: room.hostInfo,
				startTime: records[0]?.startTime.toISOString() ?? now,
				endTime: records[records.length - 1]?.endTime?.toISOString() ?? now,
			},
			duels: records.map((rec) => ({
				seed: rec.seed,
				startTime: rec.startTime.toISOString(),
				endTime: rec.endTime?.toISOString(),
				winPosition: rec.winPosition,
				winReason: rec.winReason,
				frames: rec.toEvrpFrames(),
			})),
		};

		return gzipSync(Buffer.from(JSON.stringify(envelope), "utf8"));
	}

	/**
	 * Split a gzipped buffer into STOC_EVRP_EXPORT wire frames.
	 *
	 * Wire frame layout (per D5):
	 *   [lenLo:u8][lenHi:u8][0xF0:u8][version:u8][indexLo:u8][indexHi:u8][countLo:u8][countHi:u8][chunk≤49152]
	 *
	 * Total frame ≤ 8 + 49152 = 49160 bytes — safe under the 65535 ceiling.
	 *
	 * @param gz - Gzipped buffer produced by `serialize`.
	 * @returns Array of wire-format frame Buffers, one per chunk.
	 */
	static toFrames(gz: Buffer): Buffer[] {
		const count = Math.ceil(gz.length / EVRP_CHUNK_BYTES) || 1;
		const frames: Buffer[] = [];

		for (let index = 0; index < count; index++) {
			const chunk = gz.subarray(index * EVRP_CHUNK_BYTES, (index + 1) * EVRP_CHUNK_BYTES);

			// Header: [opcode:1][version:1][index:2 LE][count:2 LE] = 6 bytes after the len prefix
			const bodyLen = 1 + 1 + 2 + 2 + chunk.length; // opcode + ver + index + count + payload
			const frame = Buffer.allocUnsafe(2 + bodyLen);

			// 2-byte LE length prefix (covers everything after the prefix)
			frame[0] = bodyLen & 0xff;
			frame[1] = (bodyLen >> 8) & 0xff;

			// STOC opcode
			frame[2] = STOC_EVRP_EXPORT;

			// version
			frame[3] = EVRP_VERSION;

			// chunk index (2-byte LE)
			frame[4] = index & 0xff;
			frame[5] = (index >> 8) & 0xff;

			// chunk count (2-byte LE)
			frame[6] = count & 0xff;
			frame[7] = (count >> 8) & 0xff;

			// payload
			chunk.copy(frame, 8);

			frames.push(frame);
		}

		return frames;
	}
}
