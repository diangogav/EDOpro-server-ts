/**
 * EvrpSerializer — envelope schema, gzip roundtrip, chunking, and wire format.
 *
 * See design D2, D3, D5 and spec R1 for details.
 */

import { gunzipSync } from 'node:zlib';
import { GameMode } from 'ygopro-msg-encode';
import { DuelRecord } from '../../DuelRecord';
import { EVRP_CHUNK_BYTES, EVRP_VERSION, STOC_EVRP_EXPORT } from '../evrp-constants';
import { EvrpSerializer } from '../EvrpSerializer';

// ---- helpers -----------------------------------------------------------

function makeRecord(overrides: Partial<DuelRecord> = {}): DuelRecord {
    const rec = new DuelRecord(
        [1, 2, 3, 4],
        [{ name: 'P1', deck: {} as never }, { name: 'P2', deck: {} as never }],
        false,
    );
    rec.winPosition = 0;
    rec.winReason = 0;
    rec.endTime = new Date('2024-01-01T00:01:00Z');
    Object.assign(rec, overrides);
    return rec;
}

const MOCK_HOST_INFO = {
    lflist: 0,
    rule: 1,
    mode: GameMode.SINGLE,
    duel_rule: 5,
    no_check_deck: 0,
    no_shuffle_deck: 0,
    start_lp: 8000,
    start_hand: 5,
    draw_count: 1,
    time_limit: 450,
    max_deck_points: 100,
    best_of: 1,
};

function makeRoom() {
    return {
        players: [{ name: 'P1' }, { name: 'P2' }] as Array<{ name: string }>,
        hostInfo: MOCK_HOST_INFO,
    };
}

// ---- envelope schema ---------------------------------------------------

describe('EvrpSerializer.serialize() — envelope schema (R1, D3)', () => {
    it('produces a valid gzip buffer', () => {
        const room = makeRoom();
        const record = makeRecord();
        const gz = EvrpSerializer.serialize(room, [record]);
        expect(() => gunzipSync(gz)).not.toThrow();
    });

    it('JSON root has version:1', () => {
        const room = makeRoom();
        const record = makeRecord();
        const gz = EvrpSerializer.serialize(room, [record]);
        const parsed = JSON.parse(gunzipSync(gz).toString('utf8'));
        expect(parsed.version).toBe(1);
    });

    it('meta contains players, hostInfo, startTime, endTime', () => {
        const room = makeRoom();
        const record = makeRecord();
        const gz = EvrpSerializer.serialize(room, [record]);
        const parsed = JSON.parse(gunzipSync(gz).toString('utf8'));
        const { meta } = parsed;
        expect(meta).toBeDefined();
        expect(Array.isArray(meta.players)).toBe(true);
        expect(meta.players).toHaveLength(2);
        expect(meta.players[0].name).toBe('P1');
        expect(meta.hostInfo).toBeDefined();
        expect(typeof meta.startTime).toBe('string');
        expect(typeof meta.endTime).toBe('string');
    });

    it('duels array has one entry per DuelRecord with required fields', () => {
        const room = makeRoom();
        const records = [makeRecord(), makeRecord()];
        const gz = EvrpSerializer.serialize(room, records);
        const parsed = JSON.parse(gunzipSync(gz).toString('utf8'));
        expect(parsed.duels).toHaveLength(2);
        for (const duel of parsed.duels) {
            expect(Array.isArray(duel.seed)).toBe(true);
            expect(typeof duel.startTime).toBe('string');
            expect(Array.isArray(duel.frames)).toBe(true);
        }
    });

    it('emits only the synthetic win frame when the record has no messages but a resolved winner', () => {
        const room = makeRoom();
        // No messages → toEvrpFrames yields only the synthetic win msg (1 frame)
        // makeRecord() sets winPosition=0 / winReason=0, so resolveObserverWinMsg() fires.
        const record = makeRecord();
        const gz = EvrpSerializer.serialize(room, [record]);
        const parsed = JSON.parse(gunzipSync(gz).toString('utf8'));
        // win msg appended by toPlayback → 1 frame
        expect(parsed.duels[0].frames).toHaveLength(1);
    });

    it('duels[i].frames is empty when the match is abandoned (no messages, no winner)', () => {
        // Spec R1: abandoned match — no messages recorded and no winPosition/winReason set.
        // resolveObserverWinMsg() returns undefined, recordedWinMsg is undefined → [] frames.
        const room = makeRoom();
        const record = makeRecord({ winPosition: undefined, winReason: undefined });
        const gz = EvrpSerializer.serialize(room, [record]);
        const parsed = JSON.parse(gunzipSync(gz).toString('utf8'));
        expect(parsed.duels[0].frames).toEqual([]);
    });

    it('roundtrip: gunzipSync then JSON.parse equals the serialized content', () => {
        const room = makeRoom();
        const record = makeRecord();
        const gz = EvrpSerializer.serialize(room, [record]);
        const parsed = JSON.parse(gunzipSync(gz).toString('utf8'));
        expect(parsed.version).toBe(EVRP_VERSION);
    });
});

// ---- chunking ----------------------------------------------------------

describe('EvrpSerializer.toFrames() — chunking (D5, R1)', () => {
    it('single small buffer → 1 chunk frame', () => {
        const gz = Buffer.from('hello world');
        const frames = EvrpSerializer.toFrames(gz);
        expect(frames).toHaveLength(1);
    });

    it('chunk count = Math.ceil(gz.length / EVRP_CHUNK_BYTES)', () => {
        // Build a buffer large enough to require exactly 2 chunks
        const twoChunkSize = EVRP_CHUNK_BYTES + 1;
        const gz = Buffer.alloc(twoChunkSize, 0xab);
        const frames = EvrpSerializer.toFrames(gz);
        expect(frames).toHaveLength(2);
    });

    it('each frame total byte length ≤ 65535', () => {
        const gz = Buffer.alloc(EVRP_CHUNK_BYTES * 3, 0x42);
        const frames = EvrpSerializer.toFrames(gz);
        for (const frame of frames) {
            expect(frame.length).toBeLessThanOrEqual(65535);
        }
    });

    it('last chunk payload is the correct partial size', () => {
        const remainder = 100;
        const gz = Buffer.alloc(EVRP_CHUNK_BYTES + remainder, 0x33);
        const frames = EvrpSerializer.toFrames(gz);
        // frame[1] = [len:2][opcode:1][ver:1][i:2][N:2][payload=remainder]
        const lastFrame = frames[1];
        const payloadLength = lastFrame.length - 8; // 2+1+1+2+2 = 8 byte header
        expect(payloadLength).toBe(remainder);
    });

    it('wire format: bytes 0-1 = LE length, byte 2 = STOC_EVRP_EXPORT, byte 3 = EVRP_VERSION', () => {
        const gz = Buffer.from('test payload');
        const frames = EvrpSerializer.toFrames(gz);
        const frame = frames[0];
        // [lenLo, lenHi] = frame.length - 2
        const bodyLen = frame.length - 2;
        expect(frame[0]).toBe(bodyLen & 0xff);
        expect(frame[1]).toBe((bodyLen >> 8) & 0xff);
        // opcode
        expect(frame[2]).toBe(STOC_EVRP_EXPORT);
        // version
        expect(frame[3]).toBe(EVRP_VERSION);
    });

    it('wire format: bytes 4-5 = index (LE), bytes 6-7 = count (LE)', () => {
        const twoChunkGz = Buffer.alloc(EVRP_CHUNK_BYTES + 1, 0xff);
        const frames = EvrpSerializer.toFrames(twoChunkGz);
        const [f0, f1] = frames;
        // count=2
        expect(f0[6]).toBe(2);
        expect(f0[7]).toBe(0);
        // index: frame 0 → 0, frame 1 → 1
        expect(f0[4]).toBe(0);
        expect(f0[5]).toBe(0);
        expect(f1[4]).toBe(1);
        expect(f1[5]).toBe(0);
    });

    it('payload bytes in frame equal the corresponding gz slice', () => {
        const gz = Buffer.alloc(EVRP_CHUNK_BYTES + 50, 0x77);
        gz[0] = 0x1f; // mark first byte
        gz[EVRP_CHUNK_BYTES] = 0xaa; // mark first byte of second chunk

        const frames = EvrpSerializer.toFrames(gz);
        // frame[0] payload starts at byte 8
        expect(frames[0][8]).toBe(0x1f);
        // frame[1] payload starts at byte 8
        expect(frames[1][8]).toBe(0xaa);
    });
});
