import {
	YGOProMsgAnnounceAttrib,
	YGOProMsgAnnounceCard,
	YGOProMsgAnnounceNumber,
	YGOProMsgAnnounceRace,
	YGOProMsgRetry,
	YGOProMsgSelectCard,
	YGOProMsgSelectCard_CardInfo,
	YGOProMsgSelectCounter,
	YGOProMsgSelectCounter_CardInfo,
	YGOProMsgSelectEffectYn,
	YGOProMsgSelectOption,
	YGOProMsgSelectPosition,
	YGOProMsgSelectSum,
	YGOProMsgSelectSum_CardInfo,
	YGOProMsgSelectTribute,
	YGOProMsgSelectTribute_CardInfo,
	YGOProMsgSelectUnselectCard,
	YGOProMsgSelectUnselectCard_CardInfo,
	YGOProMsgSelectYesNo,
	YGOProMsgSortCard,
	YGOProMsgSortCard_CardInfo,
} from "ygopro-msg-encode";
import type { IgnisReader } from "./IgnisReader";
import { readList, readLocation, readSubsequenceLocation, type Decoder } from "./ignis-fields";
import { ignisDescriptionToYgopro } from "./ignis-description";

/** Bit that marks an announce-card opcode, in the high word (Ignis) and in the word itself (YGOPro). */
const OPCODE_FLAG = 0x4000_0000;

function description(reader: IgnisReader): number {
	return ignisDescriptionToYgopro(reader.u64()) ?? 0;
}

function decodeSelectEffectYn(reader: IgnisReader): YGOProMsgSelectEffectYn {
	const message = new YGOProMsgSelectEffectYn();
	message.player = reader.u8();
	message.code = reader.u32();
	readLocation(reader, message);
	message.desc = description(reader);
	return message;
}

function decodeSelectYesNo(reader: IgnisReader): YGOProMsgSelectYesNo {
	const message = new YGOProMsgSelectYesNo();
	message.player = reader.u8();
	message.desc = description(reader);
	return message;
}

function decodeSelectOption(reader: IgnisReader): YGOProMsgSelectOption {
	const message = new YGOProMsgSelectOption();
	message.player = reader.u8();
	message.count = reader.u8();
	message.options = [];
	for (let i = 0; i < message.count; i++) message.options.push(description(reader));
	return message;
}

function decodeSelectPosition(reader: IgnisReader): YGOProMsgSelectPosition {
	const message = new YGOProMsgSelectPosition();
	message.player = reader.u8();
	message.code = reader.u32();
	message.positions = reader.u8();
	return message;
}

function decodeSelectCard(reader: IgnisReader): YGOProMsgSelectCard {
	const message = new YGOProMsgSelectCard();
	message.player = reader.u8();
	message.cancelable = reader.u8();
	message.min = reader.u32();
	message.max = reader.u32();
	message.cards = readList(reader, (r) => {
		const card = new YGOProMsgSelectCard_CardInfo();
		card.code = r.u32();
		return readSubsequenceLocation(r, card);
	});
	message.count = message.cards.length;
	return message;
}

function decodeSelectTribute(reader: IgnisReader): YGOProMsgSelectTribute {
	const message = new YGOProMsgSelectTribute();
	message.player = reader.u8();
	message.cancelable = reader.u8();
	message.min = reader.u32();
	message.max = reader.u32();
	message.cards = readList(reader, (r) => {
		const card = new YGOProMsgSelectTribute_CardInfo();
		card.code = r.u32();
		card.controller = r.u8();
		card.location = r.u8();
		card.sequence = r.u32();
		card.releaseParam = r.u8();
		return card;
	});
	message.count = message.cards.length;
	return message;
}

function decodeSelectCounter(reader: IgnisReader): YGOProMsgSelectCounter {
	const message = new YGOProMsgSelectCounter();
	message.player = reader.u8();
	message.counterType = reader.u16();
	message.counterCount = reader.u16();
	message.cards = readList(reader, (r) => {
		const card = new YGOProMsgSelectCounter_CardInfo();
		card.code = r.u32();
		card.controller = r.u8();
		card.location = r.u8();
		card.sequence = r.u8();
		card.counterCount = r.u16();
		return card;
	});
	message.count = message.cards.length;
	return message;
}

function readSumCard(reader: IgnisReader): YGOProMsgSelectSum_CardInfo {
	const card = new YGOProMsgSelectSum_CardInfo();
	card.code = reader.u32();
	card.controller = reader.u8();
	card.location = reader.u8();
	card.sequence = reader.u32();
	reader.skip(4); // position: the YGOPro shape has no slot for it
	card.opParam = reader.u32();
	return card;
}

function decodeSelectSum(reader: IgnisReader): YGOProMsgSelectSum {
	const message = new YGOProMsgSelectSum();
	message.player = reader.u8();
	message.mode = reader.u8();
	message.sumVal = reader.u32();
	message.min = reader.u32();
	message.max = reader.u32();
	message.mustSelectCards = readList(reader, readSumCard);
	message.mustSelectCount = message.mustSelectCards.length;
	message.cards = readList(reader, readSumCard);
	message.count = message.cards.length;
	return message;
}

function readUnselectCard(reader: IgnisReader): YGOProMsgSelectUnselectCard_CardInfo {
	const card = new YGOProMsgSelectUnselectCard_CardInfo();
	card.code = reader.u32();
	return readSubsequenceLocation(reader, card);
}

function decodeSelectUnselectCard(reader: IgnisReader): YGOProMsgSelectUnselectCard {
	const message = new YGOProMsgSelectUnselectCard();
	message.player = reader.u8();
	message.finishable = reader.u8();
	message.cancelable = reader.u8();
	message.min = reader.u32();
	message.max = reader.u32();
	message.selectableCards = readList(reader, readUnselectCard);
	message.selectableCount = message.selectableCards.length;
	message.unselectableCards = readList(reader, readUnselectCard);
	message.unselectableCount = message.unselectableCards.length;
	return message;
}

/** Sorting cards and sorting a chain share one layout and one answer. */
function decodeSortCard(reader: IgnisReader): YGOProMsgSortCard {
	const message = new YGOProMsgSortCard();
	message.player = reader.u8();
	message.cards = readList(reader, (r) => {
		const card = new YGOProMsgSortCard_CardInfo();
		card.code = r.u32();
		card.controller = r.u8();
		card.location = r.u32();
		card.sequence = r.u32();
		return card;
	});
	message.count = message.cards.length;
	return message;
}

function decodeAnnounceRace(reader: IgnisReader): YGOProMsgAnnounceRace {
	const message = new YGOProMsgAnnounceRace();
	message.player = reader.u8();
	message.count = reader.u8();
	message.availableRaces = reader.u64();
	return message;
}

function decodeAnnounceAttrib(reader: IgnisReader): YGOProMsgAnnounceAttrib {
	const message = new YGOProMsgAnnounceAttrib();
	message.player = reader.u8();
	message.count = reader.u8();
	message.availableAttributes = reader.u32();
	return message;
}

/**
 * The card filter is a postfix program. Ignis tags an operator in the high
 * word of a 64-bit entry; YGOPro tags it in the 32-bit entry itself, with the
 * same operator numbers.
 */
function decodeAnnounceCard(reader: IgnisReader): YGOProMsgAnnounceCard {
	const message = new YGOProMsgAnnounceCard();
	message.player = reader.u8();
	message.count = reader.u8();
	message.opcodes = [];
	for (let i = 0; i < message.count; i++) {
		const { low, high } = reader.u64Parts();
		message.opcodes.push((high & OPCODE_FLAG) !== 0 ? high : low);
	}
	return message;
}

function decodeAnnounceNumber(reader: IgnisReader): YGOProMsgAnnounceNumber {
	const message = new YGOProMsgAnnounceNumber();
	message.player = reader.u8();
	message.count = reader.u8();
	message.numbers = [];
	for (let i = 0; i < message.count; i++) message.numbers.push(reader.u64());
	return message;
}

export const PROMPT_DECODERS: Readonly<Record<number, Decoder>> = {
	1: () => new YGOProMsgRetry(),
	12: decodeSelectEffectYn,
	13: decodeSelectYesNo,
	14: decodeSelectOption,
	15: decodeSelectCard,
	19: decodeSelectPosition,
	20: decodeSelectTribute,
	21: decodeSortCard,
	22: decodeSelectCounter,
	23: decodeSelectSum,
	25: decodeSortCard,
	26: decodeSelectUnselectCard,
	140: decodeAnnounceRace,
	141: decodeAnnounceAttrib,
	142: decodeAnnounceCard,
	143: decodeAnnounceNumber,
};
