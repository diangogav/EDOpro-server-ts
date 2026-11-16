import {
	YGOProMsgAnnounceRace,
	YGOProMsgSelectCard,
	YGOProMsgSelectSum,
	YGOProMsgSelectTribute,
	YGOProMsgSelectUnselectCard,
} from "ygopro-msg-encode";

const RACE_RESPONSE_BYTES = 8;
/** Ignis card-list answer, variant 2: `[2:i32][count:u32][index:u8...]`. */
const BYTE_INDEX_LIST = 2;

function isCancel(response: Uint8Array): boolean {
	return response.length === 4 && response.every((byte) => byte === 0xff);
}

function cardList(indices: Uint8Array): Uint8Array {
	const out = new Uint8Array(8 + indices.length);
	const view = new DataView(out.buffer);
	view.setInt32(0, BYTE_INDEX_LIST, true);
	view.setUint32(4, indices.length, true);
	out.set(indices, 8);
	return out;
}

/**
 * Rewrite the answer the YGOPro duel states built for `prompt` into the form
 * the Ignis core reads. Most prompts are answered the same way in both cores;
 * the exceptions are the card lists, the one-card toggle and the race mask.
 * A cancel (`-1`) is the same four bytes everywhere.
 */
export function translateResponseToIgnis(prompt: unknown, response: Uint8Array): Uint8Array {
	if (isCancel(response)) return response;

	if (prompt instanceof YGOProMsgSelectCard || prompt instanceof YGOProMsgSelectTribute) {
		// YGOPro: `[count][index...]`.
		return cardList(response.subarray(1, 1 + (response[0] ?? 0)));
	}

	if (prompt instanceof YGOProMsgSelectSum) {
		// YGOPro lists the forced cards first; Ignis wants only the chosen ones.
		const total = response[0] ?? 0;
		return cardList(response.subarray(1 + prompt.mustSelectCount, 1 + total));
	}

	if (prompt instanceof YGOProMsgSelectUnselectCard) {
		// YGOPro: `[1][index]`; Ignis: `[1:i32][index:i32]`.
		const out = new Uint8Array(8);
		const view = new DataView(out.buffer);
		view.setInt32(0, 1, true);
		view.setInt32(4, response[1] ?? 0, true);
		return out;
	}

	if (prompt instanceof YGOProMsgAnnounceRace) {
		// The race mask is 64 bits wide in the Ignis core.
		const out = new Uint8Array(RACE_RESPONSE_BYTES);
		out.set(response.subarray(0, RACE_RESPONSE_BYTES));
		return out;
	}

	return response;
}
