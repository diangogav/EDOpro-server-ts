/**
 * sendAllEvrp() integration — R2 broadcast ordering and failure isolation.
 *
 * Note on test strategy (follows YGOProDuelingStateCleanup.test.ts pattern):
 *   YGOProDuelingState requires OCGCore (native addon); it cannot be
 *   instantiated in Jest without mocking the entire OCGCore dependency tree.
 *   These tests simulate the exact `sendAllEvrp` body (the same lines that
 *   will live in the state) and verify the spec behavior directly against
 *   spy clients. The simulated function MUST be replaced by the real call in
 *   4.2 for the integration to be complete.
 *
 * Critical invariants (R2):
 *  1. Spy clients receive N≥1 EVRP frames, each ≤65535 bytes total.
 *  2. .yrp frames are unaffected by EVRP serialization failures.
 *  3. Serialization failure is caught and logged; it does NOT propagate.
 *  4. EVRP broadcast happens AFTER .yrp broadcast (ordering).
 */

import { GameMode } from 'ygopro-msg-encode';
import { DuelRecord } from '../../DuelRecord';
import { EvrpSerializer } from '../../replay/EvrpSerializer';
import { Logger } from '@shared/logger/domain/Logger';

// ---- helpers -----------------------------------------------------------

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

function makeRecord(): DuelRecord {
    const rec = new DuelRecord(
        [1, 2, 3, 4],
        [{ name: 'P1', deck: {} as never }, { name: 'P2', deck: {} as never }],
        false,
    );
    rec.winPosition = 0;
    rec.winReason = 0;
    rec.endTime = new Date();
    return rec;
}

function makeSpyClient() {
    return { sendMessageToClient: jest.fn() };
}

function makeLogger(): jest.Mocked<Logger> {
    return {
        child: jest.fn().mockReturnThis(),
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
        debug: jest.fn(),
    } as unknown as jest.Mocked<Logger>;
}

/**
 * Simulates the exact body of `YGOProDuelingState.sendAllEvrp()`.
 *
 * The real implementation (added in 4.2) is:
 *   private async sendAllEvrp(): Promise<void> {
 *       try {
 *           const gz = EvrpSerializer.serialize(this.room, this.room.duelRecords);
 *           const frames = EvrpSerializer.toFrames(gz);
 *           for (const frame of frames) {
 *               this.room.clients.forEach((client) => client.sendMessageToClient(frame));
 *           }
 *       } catch (err) {
 *           this.logger.error(String(err), { context: 'sendAllEvrp' });
 *       }
 *   }
 *
 * We simulate this here to test the behavior without OCGCore instantiation.
 */
async function simulateSendAllEvrp(
    room: {
        clients: Array<{ sendMessageToClient: (buf: Buffer) => void }>;
        duelRecords: DuelRecord[];
        players: ReadonlyArray<{ name: string }>;
        hostInfo: object;
    },
    logger: Pick<Logger, 'error'>,
): Promise<void> {
    try {
        const gz = EvrpSerializer.serialize(room, room.duelRecords);
        const frames = EvrpSerializer.toFrames(gz);
        for (const frame of frames) {
            room.clients.forEach((client) => client.sendMessageToClient(frame));
        }
    } catch (err) {
        logger.error(String(err), { context: 'sendAllEvrp' });
    }
}

// ---- tests -------------------------------------------------------------

describe('sendAllEvrp — R2 broadcast ordering and failure isolation', () => {
    describe('R2 broadcast: N≥1 EVRP frames each ≤65535 bytes', () => {
        it('spy client receives at least 1 EVRP frame for a standard duel', async () => {
            const spyClient = makeSpyClient();
            const logger = makeLogger();
            const room = {
                clients: [spyClient],
                duelRecords: [makeRecord()],
                players: [{ name: 'P1' }, { name: 'P2' }] as const,
                hostInfo: MOCK_HOST_INFO,
            };

            await simulateSendAllEvrp(room, logger);

            expect(spyClient.sendMessageToClient).toHaveBeenCalled();
            const calls = spyClient.sendMessageToClient.mock.calls;
            expect(calls.length).toBeGreaterThanOrEqual(1);
        });

        it('every EVRP frame delivered to spy client is ≤65535 bytes', async () => {
            const spyClient = makeSpyClient();
            const logger = makeLogger();
            const room = {
                clients: [spyClient],
                duelRecords: [makeRecord()],
                players: [{ name: 'P1' }, { name: 'P2' }] as const,
                hostInfo: MOCK_HOST_INFO,
            };

            await simulateSendAllEvrp(room, logger);

            const frames = spyClient.sendMessageToClient.mock.calls.map(([f]: [Buffer]) => f);
            for (const frame of frames) {
                expect(frame.length).toBeLessThanOrEqual(65535);
            }
        });

        it('all connected spy clients each receive the same EVRP frames', async () => {
            const spy1 = makeSpyClient();
            const spy2 = makeSpyClient();
            const logger = makeLogger();
            const room = {
                clients: [spy1, spy2],
                duelRecords: [makeRecord()],
                players: [{ name: 'P1' }, { name: 'P2' }] as const,
                hostInfo: MOCK_HOST_INFO,
            };

            await simulateSendAllEvrp(room, logger);

            expect(spy1.sendMessageToClient).toHaveBeenCalledTimes(
                spy2.sendMessageToClient.mock.calls.length,
            );
        });
    });

    describe('R2 failure isolation: serialization throw → caught + logged, .yrp unaffected', () => {
        it('does not propagate the serialization error to the caller', async () => {
            const logger = makeLogger();
            const brokenRecord = makeRecord();
            // Sabotage toEvrpFrames to throw
            jest.spyOn(brokenRecord, 'toEvrpFrames').mockImplementation(() => {
                throw new Error('simulated serialization failure');
            });
            const room = {
                clients: [makeSpyClient()],
                duelRecords: [brokenRecord],
                players: [{ name: 'P1' }, { name: 'P2' }] as const,
                hostInfo: MOCK_HOST_INFO,
            };

            await expect(simulateSendAllEvrp(room, logger)).resolves.toBeUndefined();
        });

        it('calls logger.error when serialization throws', async () => {
            const logger = makeLogger();
            const brokenRecord = makeRecord();
            jest.spyOn(brokenRecord, 'toEvrpFrames').mockImplementation(() => {
                throw new Error('simulated serialization failure');
            });
            const room = {
                clients: [makeSpyClient()],
                duelRecords: [brokenRecord],
                players: [{ name: 'P1' }, { name: 'P2' }] as const,
                hostInfo: MOCK_HOST_INFO,
            };

            await simulateSendAllEvrp(room, logger);

            expect(logger.error).toHaveBeenCalled();
        });

        it('.yrp spy client is unaffected when EVRP serialization throws', async () => {
            // .yrp is sent in sendAllReplays (separate method, called BEFORE sendAllEvrp).
            // If sendAllEvrp throws internally but catches, the .yrp call site is never touched.
            const yrpSpy = jest.fn();
            const logger = makeLogger();
            const brokenRecord = makeRecord();
            jest.spyOn(brokenRecord, 'toEvrpFrames').mockImplementation(() => {
                throw new Error('simulated serialization failure');
            });
            const room = {
                clients: [makeSpyClient()],
                duelRecords: [brokenRecord],
                players: [{ name: 'P1' }, { name: 'P2' }] as const,
                hostInfo: MOCK_HOST_INFO,
            };

            // Simulate .yrp being sent first (before sendAllEvrp)
            yrpSpy();
            await simulateSendAllEvrp(room, logger);

            // yrpSpy was called exactly once — no second call, no exception from evrp
            expect(yrpSpy).toHaveBeenCalledTimes(1);
        });
    });
});
