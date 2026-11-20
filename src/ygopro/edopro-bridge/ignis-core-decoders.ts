import {
	YGOProMsgDraw,
	YGOProMsgHint,
	YGOProMsgMove,
	YGOProMsgMove_CardLocation,
	YGOProMsgNewPhase,
	YGOProMsgNewTurn,
	YGOProMsgSelectChain,
	YGOProMsgSelectChain_ChainInfo,
	YGOProMsgSelectDisField,
	YGOProMsgSelectIdleCmd,
	YGOProMsgSelectIdleCmd_ActivatableInfo,
	YGOProMsgSelectIdleCmd_SimpleCardInfo,
	YGOProMsgSelectPlace,
	YGOProMsgStart,
	YGOProMsgStart_PlayerInfo,
	YGOProMsgSummoned,
	YGOProMsgSummoning,
	YGOProMsgUpdateCard,
	YGOProMsgUpdateData,
	YGOProMsgWaiting,
	type CardQuery,
} from "ygopro-msg-encode";

import { decodeIgnisQuery } from "./decodeIgnisQuery";
import { ignisDescriptionToYgopro } from "./ignis-description";
import {
	readActivatableCards,
	readLocation,
	type Decoder,
	type IgnisTranslationContext,
} from "./ignis-fields";
import type { IgnisReader } from "./IgnisReader";

const POS_FACEUP = 0x5;
const KNOWN_CARD_FLAG = 0x8000_0000;
/** Hint types whose payload is a string id rather than a code, number or mask. */
const DESCRIPTION_HINTS: ReadonlySet<number> = new Set([1, 2, 3, 4]);

/** Speed Duel Skill hints: the Skill's code, its cover, a flip and its removal. */
const SKILL_HINTS: ReadonlySet<number> = new Set([200, 201, 202, 203]);
const HINT_SKILL_FLIP = 202;
/** High half of a flip hint that turns the Skill back to its cover. */
const SKILL_FLIP_TO_COVER = 2;
/**
 * Not an EDOPro hint: the flip of a Skill back to its cover, for a client of
 * the YGOPro wire. EDOPro tells the two flips apart in the high half of the
 * hint, which the 32-bit YGOPro hint does not carry.
 */
const HINT_SKILL_FLIP_TO_COVER = 204;

function decodeHint(reader: IgnisReader): YGOProMsgHint {
	const message = new YGOProMsgHint();
	message.type = reader.u8();
	message.player = reader.u8();
	const { low, high } = reader.u64Parts();
	if (SKILL_HINTS.has(message.type)) {
		if (message.type === HINT_SKILL_FLIP && high === SKILL_FLIP_TO_COVER) {
			message.type = HINT_SKILL_FLIP_TO_COVER;
		}
		message.desc = low;

		return message;
	}
	const data = high * 0x1_0000_0000 + low;
	message.desc = DESCRIPTION_HINTS.has(message.type) ? (ignisDescriptionToYgopro(data) ?? 0) : data;

	return message;
}

function decodeStart(reader: IgnisReader, context: IgnisTranslationContext): YGOProMsgStart {
	const message = new YGOProMsgStart();
	message.playerType = reader.u8();
	message.duelRule = context.duelRule;
	message.startLp0 = reader.u32();
	message.startLp1 = reader.u32();
	message.player0 = readDeckCounts(reader);
	message.player1 = readDeckCounts(reader);
	return message;
}

function readDeckCounts(reader: IgnisReader): YGOProMsgStart_PlayerInfo {
	const info = new YGOProMsgStart_PlayerInfo();
	info.deckCount = reader.u16();
	info.extraCount = reader.u16();
	return info;
}

/** One query per slot of the location, in sequence order, after a total byte length. */
function decodeUpdateData(reader: IgnisReader): YGOProMsgUpdateData {
	const message = new YGOProMsgUpdateData();
	message.player = reader.u8();
	message.location = reader.u8();
	message.cards = [];
	reader.skip(4);
	while (reader.remaining > 0) {
		message.cards.push(
			placeQuery(decodeIgnisQuery(reader), message.player, message.location, message.cards.length),
		);
	}
	return message;
}

function decodeUpdateCard(reader: IgnisReader): YGOProMsgUpdateCard {
	const message = new YGOProMsgUpdateCard();
	message.controller = reader.u8();
	message.location = reader.u8();
	message.sequence = reader.u8();
	message.card = placeQuery(
		decodeIgnisQuery(reader),
		message.controller,
		message.location,
		message.sequence,
	);
	return message;
}

/** The Ignis query carries only the position; the YGOPro one also names the slot. */
function placeQuery(
	query: CardQuery,
	controller: number,
	location: number,
	sequence: number,
): CardQuery {
	if (query.empty === true) return query;
	query.controller = controller;
	query.location = location;
	query.sequence = sequence;
	return query;
}

function decodeNewTurn(reader: IgnisReader): YGOProMsgNewTurn {
	const message = new YGOProMsgNewTurn();
	message.player = reader.u8();
	return message;
}

function decodeNewPhase(reader: IgnisReader): YGOProMsgNewPhase {
	const message = new YGOProMsgNewPhase();
	message.phase = reader.u16();
	return message;
}

function decodeDraw(reader: IgnisReader): YGOProMsgDraw {
	const message = new YGOProMsgDraw();
	message.player = reader.u8();
	message.count = reader.u32();
	message.cards = [];
	for (let i = 0; i < message.count; i++) {
		const code = reader.u32();
		const position = reader.u32();
		const known = (position & POS_FACEUP) !== 0 ? KNOWN_CARD_FLAG : 0;
		message.cards.push((code | known) >>> 0);
	}
	return message;
}

function decodeMove(reader: IgnisReader): YGOProMsgMove {
	const message = new YGOProMsgMove();
	message.code = reader.u32();
	message.previous = readLocation(reader, new YGOProMsgMove_CardLocation());
	message.current = readLocation(reader, new YGOProMsgMove_CardLocation());
	message.reason = reader.u32();
	return message;
}

function decodeSummoning(reader: IgnisReader): YGOProMsgSummoning {
	const message = new YGOProMsgSummoning();
	message.code = reader.u32();
	return readLocation(reader, message);
}

function readPlaceRequest<T extends YGOProMsgSelectPlace | YGOProMsgSelectDisField>(
	reader: IgnisReader,
	message: T,
): T {
	message.player = reader.u8();
	message.count = reader.u8();
	message.flag = reader.u32();
	return message;
}

/**
 * The Ignis core says once whether the whole prompt is mandatory; YGOPro marks
 * each chain. Every chain inherits the prompt's flag.
 */
function decodeSelectChain(reader: IgnisReader): YGOProMsgSelectChain {
	const message = new YGOProMsgSelectChain();
	message.player = reader.u8();
	message.specialCount = reader.u8();
	const forced = reader.u8();
	message.hint0 = reader.u32();
	message.hint1 = reader.u32();
	message.count = reader.u32();
	message.chains = [];
	for (let i = 0; i < message.count; i++) {
		const chain = new YGOProMsgSelectChain_ChainInfo();
		chain.code = reader.u32();
		chain.controller = reader.u8();
		chain.location = reader.u8();
		chain.sequence = reader.u32();
		chain.subsequence = reader.u32();
		chain.desc = ignisDescriptionToYgopro(reader.u64()) ?? 0;
		chain.edesc = reader.u8();
		chain.forced = forced;
		message.chains.push(chain);
	}
	return message;
}

function decodeSelectIdleCmd(reader: IgnisReader): YGOProMsgSelectIdleCmd {
	const message = new YGOProMsgSelectIdleCmd();
	message.player = reader.u8();
	message.summonableCards = readSimpleCards(reader, "wide");
	message.spSummonableCards = readSimpleCards(reader, "wide");
	message.reposableCards = readSimpleCards(reader, "narrow");
	message.msetableCards = readSimpleCards(reader, "wide");
	message.ssetableCards = readSimpleCards(reader, "wide");
	message.activatableCards = readActivatableCards(
		reader,
		() => new YGOProMsgSelectIdleCmd_ActivatableInfo(),
	);
	message.summonableCount = message.summonableCards.length;
	message.spSummonableCount = message.spSummonableCards.length;
	message.reposableCount = message.reposableCards.length;
	message.msetableCount = message.msetableCards.length;
	message.ssetableCount = message.ssetableCards.length;
	message.activatableCount = message.activatableCards.length;
	message.canBp = reader.u8();
	message.canEp = reader.u8();
	message.canShuffle = reader.u8();
	return message;
}

/** The core writes a 32-bit sequence in every idle list except reposition. */
function readSimpleCards(
	reader: IgnisReader,
	sequenceWidth: "wide" | "narrow",
): YGOProMsgSelectIdleCmd_SimpleCardInfo[] {
	const count = reader.u32();
	const cards: YGOProMsgSelectIdleCmd_SimpleCardInfo[] = [];
	for (let i = 0; i < count; i++) {
		const card = new YGOProMsgSelectIdleCmd_SimpleCardInfo();
		card.code = reader.u32();
		card.controller = reader.u8();
		card.location = reader.u8();
		card.sequence = sequenceWidth === "wide" ? reader.u32() : reader.u8();
		cards.push(card);
	}
	return cards;
}

/**
 * The messages every duel needs from its first turn: the start, the queries
 * that fill the board, turns and phases, the idle prompt, moving and
 * summoning a card, and choosing a zone or a chain link.
 */
export const CORE_DECODERS: Readonly<Record<number, Decoder>> = {
	2: decodeHint,
	3: () => new YGOProMsgWaiting(),
	4: decodeStart,
	6: decodeUpdateData,
	7: decodeUpdateCard,
	11: decodeSelectIdleCmd,
	16: decodeSelectChain,
	18: (reader) => readPlaceRequest(reader, new YGOProMsgSelectPlace()),
	24: (reader) => readPlaceRequest(reader, new YGOProMsgSelectDisField()),
	40: decodeNewTurn,
	41: decodeNewPhase,
	50: decodeMove,
	60: decodeSummoning,
	61: () => new YGOProMsgSummoned(),
	90: decodeDraw,
};
