import {
	YGOProMsgHint,
	YGOProMsgMove,
	YGOProMsgSelectCard,
	YGOProMsgWin,
	YGOProStoc,
	YGOProStocGameMsg,
} from "ygopro-msg-encode";

import { DuelRecordMother } from "@test-support/mothers/room/DuelRecordMother";

import { DuelRecord } from "./DuelRecord";

// OCGCore LOCATION values.
const LOCATION_DECK = 1;
const LOCATION_HAND = 2;

// Build a wire-format MSG_MOVE the way OCGCore emits it (code/previous/current
// set directly), not through the fromPartial card wrappers.
function buildMsgMove(code: number, fromLocation: number): YGOProMsgMove {
	const msg = new YGOProMsgMove();
	msg.code = code;
	msg.previous = { controller: 0, location: fromLocation, sequence: 0, position: 0 };
	msg.current = { controller: 0, location: 0, sequence: 0, position: 0 };
	msg.reason = 0;
	return msg;
}

// type=1, player=0 → getSendTargets() returns [0], never OBSERVER: a private hint.
function buildPrivateHint(): YGOProMsgHint {
	return new YGOProMsgHint().fromPartial({ type: 1, player: 0 });
}

function buildWinMsg(): YGOProMsgWin {
	return new YGOProMsgWin().fromPartial({ player: 0, type: 0 });
}

function buildResponse(): YGOProMsgSelectCard {
	return new YGOProMsgSelectCard();
}

function decodeFrames(frames: string[]) {
	return frames.map((b64) => YGOProStoc.getInstanceFromPayload(Buffer.from(b64, "base64")));
}

describe("DuelRecord.toEvrpFrames()", () => {
	let record: DuelRecord;

	beforeEach(() => {
		record = DuelRecordMother.create();
	});

	describe("omniscient stream", () => {
		it("keeps the real card code on a MSG_MOVE from the hand", () => {
			record.messages.push(buildMsgMove(12345, LOCATION_HAND));

			const moveFrame = decodeFrames(record.toEvrpFrames()).find(
				(stoc) => stoc instanceof YGOProStocGameMsg && stoc.msg instanceof YGOProMsgMove,
			) as YGOProStocGameMsg | undefined;

			expect(moveFrame).toBeDefined();
			expect((moveFrame!.msg as YGOProMsgMove).code).toBe(12345);
		});

		it("keeps a nonzero card code on a MSG_MOVE from the deck", () => {
			record.messages.push(buildMsgMove(99999, LOCATION_DECK));

			const moveFrame = decodeFrames(record.toEvrpFrames()).find(
				(stoc) => stoc instanceof YGOProStocGameMsg && stoc.msg instanceof YGOProMsgMove,
			) as YGOProStocGameMsg | undefined;

			expect(moveFrame).toBeDefined();
			expect((moveFrame!.msg as YGOProMsgMove).code).not.toBe(0);
		});

		it("includes private hints that default playback would drop", () => {
			record.messages.push(buildPrivateHint());

			// 1 private hint + 1 appended win frame.
			expect(record.toEvrpFrames()).toHaveLength(2);
		});
	});

	describe("frame accounting", () => {
		it("yields only the win frame for an empty message list", () => {
			expect(record.toEvrpFrames()).toHaveLength(1);
		});

		it("drops responses, appends the win message once, keeps the rest", () => {
			record.messages.push(buildMsgMove(12345, LOCATION_HAND));
			record.messages.push(buildPrivateHint());
			record.messages.push(buildResponse());
			record.messages.push(buildWinMsg());

			// move + hint + single appended win = 3 (response excluded, win not duplicated).
			expect(record.toEvrpFrames()).toHaveLength(3);
		});
	});

	describe("decodability", () => {
		it("emits frames that round-trip to YGOProStocGameMsg", () => {
			record.messages.push(buildMsgMove(12345, LOCATION_HAND));
			record.messages.push(buildPrivateHint());

			for (const stoc of decodeFrames(record.toEvrpFrames())) {
				expect(stoc).toBeInstanceOf(YGOProStocGameMsg);
			}
		});
	});
});
