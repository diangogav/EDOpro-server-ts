/**
 * D1 gate — DuelRecord.toEvrpFrames() omniscient stream verification.
 *
 * Asserts:
 *  (a) MSG_MOVE from HAND/DECK → emitted frame has nonzero `code` (omniscient, unmasked).
 *  (b) Frame count = non-response non-win messages + win msg appended (no dup, no loss).
 *  (c) Every frame decodes to YGOProStocGameMsg.
 *
 * See design D1 and spec R1 for the rationale.
 */

import {
    NetPlayerType,
    YGOProMsgHint,
    YGOProMsgMove,
    YGOProMsgSelectCard,
    YGOProMsgWin,
    YGOProStoc,
    YGOProStocGameMsg,
} from 'ygopro-msg-encode';
import { DuelRecord } from '../DuelRecord';

// ---- Wire-format helpers -----------------------------------------------

/** LOCATION constants matching OCGCore values. */
const LOCATION_HAND = 2;
const LOCATION_DECK = 1;

/**
 * Build a wire-format YGOProMsgMove (sets code/previous/current directly,
 * matching how OCGCore produces them — not via fromPartial card wrappers).
 */
function buildMsgMove(code: number, fromLocation: number): YGOProMsgMove {
    const msg = new YGOProMsgMove();
    msg.code = code;
    msg.previous = { controller: 0, location: fromLocation, sequence: 0, position: 0 };
    msg.current = { controller: 0, location: 0, sequence: 0, position: 0 };
    msg.reason = 0;
    return msg;
}

/** MSG_HINT that targets only player 0 (not OBSERVER — private hint). */
function buildPrivateHint(): YGOProMsgHint {
    // type=1, player=0 → getSendTargets() returns [0] (not OBSERVER).
    return new YGOProMsgHint().fromPartial({ type: 1, player: 0 });
}

/** Win message for player 0 (type=0). */
function buildWinMsg(): YGOProMsgWin {
    return new YGOProMsgWin().fromPartial({ player: 0, type: 0 });
}

/** A select-card response (YGOProMsgResponseBase subtype). */
function buildResponse(): YGOProMsgSelectCard {
    return new YGOProMsgSelectCard();
}

// ---- fixtures -----------------------------------------------------------

function makeRecord(): DuelRecord {
    return new DuelRecord(
        [1, 2, 3, 4],
        [{ name: 'P1', deck: {} as never }, { name: 'P2', deck: {} as never }],
        false,
    );
}

// ---- tests --------------------------------------------------------------

describe('DuelRecord.toEvrpFrames() — omniscient stream (D1)', () => {
    let record: DuelRecord;

    beforeEach(() => {
        record = makeRecord();
        // Win record needed for resolveObserverWinMsg()
        record.winPosition = 0;
        record.winReason = 0;
    });

    describe('(a) omniscience — MSG_MOVE code is nonzero', () => {
        it('emits a frame with nonzero code for MSG_MOVE from HAND', () => {
            const moveMsg = buildMsgMove(12345, LOCATION_HAND);
            record.messages.push(moveMsg);

            const frames = record.toEvrpFrames();

            // Find the frame that contains the MSG_MOVE
            const decoded = frames.map((b64) =>
                YGOProStoc.getInstanceFromPayload(Buffer.from(b64, 'base64')),
            );
            const movFrame = decoded.find(
                (stoc) => stoc instanceof YGOProStocGameMsg && stoc.msg instanceof YGOProMsgMove,
            ) as YGOProStocGameMsg | undefined;

            expect(movFrame).toBeDefined();
            const move = movFrame!.msg as YGOProMsgMove;
            expect(move.code).not.toBe(0);
            expect(move.code).toBe(12345);
        });

        it('emits a frame with nonzero code for MSG_MOVE from DECK', () => {
            const moveMsg = buildMsgMove(99999, LOCATION_DECK);
            record.messages.push(moveMsg);

            const frames = record.toEvrpFrames();

            const decoded = frames.map((b64) =>
                YGOProStoc.getInstanceFromPayload(Buffer.from(b64, 'base64')),
            );
            const movFrame = decoded.find(
                (stoc) => stoc instanceof YGOProStocGameMsg && stoc.msg instanceof YGOProMsgMove,
            ) as YGOProStocGameMsg | undefined;

            expect(movFrame).toBeDefined();
            const move = movFrame!.msg as YGOProMsgMove;
            expect(move.code).not.toBe(0);
        });
    });

    describe('(b) frame count — no dup, no loss', () => {
        it('yields 1 frame (win msg) for an empty message list', () => {
            // record.messages is empty — toPlayback emits only the win msg
            const frames = record.toEvrpFrames();
            expect(frames).toHaveLength(1);
        });

        it('excludes response msgs and win msgs from the count; appends win msg once', () => {
            // Setup: 1 MSG_MOVE + 1 private hint + 1 response + 1 win msg in messages
            // Expected output: MSG_MOVE + hint (includeNonObserver:true) + appended win = 3 frames
            record.messages.push(buildMsgMove(12345, LOCATION_HAND));
            record.messages.push(buildPrivateHint());
            record.messages.push(buildResponse()); // excluded: includeResponse=false
            record.messages.push(buildWinMsg());   // excluded from loop, appended once

            const frames = record.toEvrpFrames();
            expect(frames).toHaveLength(3);
        });

        it('includes private hints (includeNonObserver:true)', () => {
            // MSG_HINT getSendTargets()=[0] — not OBSERVER; default toPlayback would drop it
            record.messages.push(buildPrivateHint());

            const frames = record.toEvrpFrames();
            // 1 private hint + 1 win msg = 2
            expect(frames).toHaveLength(2);
        });
    });

    describe('(c) decodability — every frame is a YGOProStocGameMsg', () => {
        it('each base64 frame round-trips to YGOProStocGameMsg', () => {
            record.messages.push(buildMsgMove(12345, LOCATION_HAND));
            record.messages.push(buildPrivateHint());

            const frames = record.toEvrpFrames();

            for (const b64 of frames) {
                const buf = Buffer.from(b64, 'base64');
                const stoc = YGOProStoc.getInstanceFromPayload(buf);
                expect(stoc).toBeInstanceOf(YGOProStocGameMsg);
            }
        });
    });
});
