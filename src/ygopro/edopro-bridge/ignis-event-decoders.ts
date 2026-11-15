import {
	YGOProMsgAddCounter,
	YGOProMsgBecomeTarget,
	YGOProMsgCancelTarget,
	YGOProMsgCancelTarget_CardLocation,
	YGOProMsgCardHint,
	YGOProMsgCardTarget,
	YGOProMsgCardTarget_CardLocation,
	YGOProMsgChainDisabled,
	YGOProMsgChainEnd,
	YGOProMsgChainNegated,
	YGOProMsgChainSolved,
	YGOProMsgChainSolving,
	YGOProMsgChained,
	YGOProMsgChaining,
	YGOProMsgChaining_CardLocation,
	YGOProMsgConfirmCards,
	YGOProMsgConfirmCards_CardInfo,
	YGOProMsgConfirmDeckTop,
	YGOProMsgConfirmDeckTop_CardInfo,
	YGOProMsgConfirmExtraTop,
	YGOProMsgConfirmExtraTop_CardInfo,
	YGOProMsgDeckTop,
	YGOProMsgEquip,
	YGOProMsgEquip_CardLocation,
	YGOProMsgFieldDisabled,
	YGOProMsgFlipSummoned,
	YGOProMsgFlipSummoning,
	YGOProMsgMissedEffect,
	YGOProMsgPlayerHint,
	YGOProMsgRandomSelected,
	YGOProMsgReloadField,
	YGOProMsgReloadField_ChainInfo,
	YGOProMsgReloadField_PlayerInfo,
	YGOProMsgReloadField_ZoneCard,
	YGOProMsgRemoveCounter,
	YGOProMsgReverseDeck,
	YGOProMsgSet,
	YGOProMsgShuffleDeck,
	YGOProMsgShuffleExtra,
	YGOProMsgShuffleHand,
	YGOProMsgShuffleSetCard,
	YGOProMsgShuffleSetCard_CardLocation,
	YGOProMsgShuffleSetCard_SetCardInfo,
	YGOProMsgSpSummoned,
	YGOProMsgSpSummoning,
	YGOProMsgSwap,
	YGOProMsgSwapGraveDeck,
	YGOProMsgSwap_CardLocation,
	YGOProMsgTossCoin,
	YGOProMsgTossDice,
} from "ygopro-msg-encode";
import type { IgnisReader } from "./IgnisReader";
import {
	readList,
	readLocation,
	readPackedLocation,
	readSubsequenceLocation,
	type CardLocation,
	type Decoder,
} from "./ignis-fields";
import { duelRuleFromFlags } from "./edopro-lobby";
import { ignisDescriptionToYgopro } from "./ignis-description";

const POS_FACEUP = 0x5;
const KNOWN_CARD_FLAG = 0x8000_0000;
/** Card and player hint types whose value is a string id. */
const HINT_DESC_ADD = 6;
const HINT_DESC_REMOVE = 7;

/** `[code:u32][location]`: Set, Special Summon and Flip Summon announce a card this way. */
function readCodeAndLocation<T extends CardLocation & { code: number }>(
	reader: IgnisReader,
	message: T,
): T {
	message.code = reader.u32();
	return readLocation(reader, message);
}

function readChainCount<T extends { chainCount: number }>(reader: IgnisReader, message: T): T {
	message.chainCount = reader.u8();
	return message;
}

function decodeSwap(reader: IgnisReader): YGOProMsgSwap {
	const message = new YGOProMsgSwap();
	message.code1 = reader.u32();
	message.card1 = readLocation(reader, new YGOProMsgSwap_CardLocation());
	message.code2 = reader.u32();
	message.card2 = readLocation(reader, new YGOProMsgSwap_CardLocation());
	return message;
}

function decodeFieldDisabled(reader: IgnisReader): YGOProMsgFieldDisabled {
	const message = new YGOProMsgFieldDisabled();
	message.disabledField = reader.u32();
	return message;
}

function decodeChaining(reader: IgnisReader): YGOProMsgChaining {
	const message = new YGOProMsgChaining();
	message.code = reader.u32();
	readSubsequenceLocation(reader, message);
	message.chainCardLocation = new YGOProMsgChaining_CardLocation();
	message.chainCardLocation.controller = reader.u8();
	message.chainCardLocation.location = reader.u8();
	message.chainCardLocation.sequence = reader.u32();
	message.desc = ignisDescriptionToYgopro(reader.u64()) ?? 0;
	message.chainCount = reader.u32();
	return message;
}

function decodeRandomSelected(reader: IgnisReader): YGOProMsgRandomSelected {
	const message = new YGOProMsgRandomSelected();
	message.player = reader.u8();
	message.cards = readList(reader, readPackedLocation);
	message.count = message.cards.length;
	return message;
}

function decodeBecomeTarget(reader: IgnisReader): YGOProMsgBecomeTarget {
	const message = new YGOProMsgBecomeTarget();
	message.targets = readList(reader, readPackedLocation);
	message.count = message.targets.length;
	return message;
}

function decodeEquip(reader: IgnisReader): YGOProMsgEquip {
	const message = new YGOProMsgEquip();
	message.equip = readLocation(reader, new YGOProMsgEquip_CardLocation());
	message.target = readLocation(reader, new YGOProMsgEquip_CardLocation());
	return message;
}

function decodeCardTarget(reader: IgnisReader): YGOProMsgCardTarget {
	const message = new YGOProMsgCardTarget();
	message.card1 = readLocation(reader, new YGOProMsgCardTarget_CardLocation());
	message.card2 = readLocation(reader, new YGOProMsgCardTarget_CardLocation());
	return message;
}

function decodeCancelTarget(reader: IgnisReader): YGOProMsgCancelTarget {
	const message = new YGOProMsgCancelTarget();
	message.card1 = readLocation(reader, new YGOProMsgCancelTarget_CardLocation());
	message.card2 = readLocation(reader, new YGOProMsgCancelTarget_CardLocation());
	return message;
}

function readCounterChange<T extends YGOProMsgAddCounter | YGOProMsgRemoveCounter>(
	reader: IgnisReader,
	message: T,
): T {
	message.counterType = reader.u16();
	message.controller = reader.u8();
	message.location = reader.u8();
	message.sequence = reader.u8();
	message.count = reader.u16();
	return message;
}

interface RevealedCard {
	code: number;
	controller: number;
	location: number;
	sequence: number;
}

function readRevealedCard<T extends RevealedCard>(reader: IgnisReader, card: T): T {
	card.code = reader.u32();
	card.controller = reader.u8();
	card.location = reader.u8();
	card.sequence = reader.u32();
	return card;
}

function decodeConfirmDeckTop(reader: IgnisReader): YGOProMsgConfirmDeckTop {
	const message = new YGOProMsgConfirmDeckTop();
	message.player = reader.u8();
	message.cards = readList(reader, (r) =>
		readRevealedCard(r, new YGOProMsgConfirmDeckTop_CardInfo()),
	);
	message.count = message.cards.length;
	return message;
}

function decodeConfirmExtraTop(reader: IgnisReader): YGOProMsgConfirmExtraTop {
	const message = new YGOProMsgConfirmExtraTop();
	message.player = reader.u8();
	message.cards = readList(reader, (r) =>
		readRevealedCard(r, new YGOProMsgConfirmExtraTop_CardInfo()),
	);
	message.count = message.cards.length;
	return message;
}

function decodeConfirmCards(reader: IgnisReader): YGOProMsgConfirmCards {
	const message = new YGOProMsgConfirmCards();
	message.player = reader.u8();
	message.skipPanel = 0;
	message.cards = readList(reader, (r) =>
		readRevealedCard(r, new YGOProMsgConfirmCards_CardInfo()),
	);
	message.count = message.cards.length;
	return message;
}

/**
 * Ignis follows the player with which deck cards moved to the Extra Deck; a
 * YGOPro client only needs the player and refreshes both piles from queries.
 */
function decodeSwapGraveDeck(reader: IgnisReader): YGOProMsgSwapGraveDeck {
	const message = new YGOProMsgSwapGraveDeck();
	message.player = reader.u8();

	return message;
}

function decodeShuffleDeck(reader: IgnisReader): YGOProMsgShuffleDeck {
	const message = new YGOProMsgShuffleDeck();
	message.player = reader.u8();
	return message;
}

function readShuffledCodes<T extends YGOProMsgShuffleHand | YGOProMsgShuffleExtra>(
	reader: IgnisReader,
	message: T,
): T {
	message.player = reader.u8();
	message.cards = readList(reader, (r) => r.u32());
	message.count = message.cards.length;
	return message;
}

/** `[location][count]`, then every old location, then every new one. */
function decodeShuffleSetCard(reader: IgnisReader): YGOProMsgShuffleSetCard {
	const message = new YGOProMsgShuffleSetCard();
	message.location = reader.u8();
	message.count = reader.u8();
	const oldLocations: YGOProMsgShuffleSetCard_CardLocation[] = [];
	for (let i = 0; i < message.count; i++) {
		oldLocations.push(readLocation(reader, new YGOProMsgShuffleSetCard_CardLocation()));
	}
	message.cards = oldLocations.map((oldLocation) => {
		const entry = new YGOProMsgShuffleSetCard_SetCardInfo();
		entry.oldLocation = oldLocation;
		entry.newLocation = readLocation(reader, new YGOProMsgShuffleSetCard_CardLocation());
		return entry;
	});
	return message;
}

/** YGOPro folds "face-up" into the top bit of the code; Ignis sends the position apart. */
function decodeDeckTop(reader: IgnisReader): YGOProMsgDeckTop {
	const message = new YGOProMsgDeckTop();
	message.player = reader.u8();
	message.sequence = reader.u32();
	const code = reader.u32();
	const position = reader.u32();
	message.code = ((position & POS_FACEUP) !== 0 ? code | KNOWN_CARD_FLAG : code) >>> 0;
	return message;
}

function decodeMissedEffect(reader: IgnisReader): YGOProMsgMissedEffect {
	const message = readLocation(reader, new YGOProMsgMissedEffect());
	message.code = reader.u32();
	return message;
}

function readToss<T extends YGOProMsgTossCoin | YGOProMsgTossDice>(
	reader: IgnisReader,
	message: T,
): T {
	message.player = reader.u8();
	message.count = reader.u8();
	message.results = [];
	for (let i = 0; i < message.count; i++) message.results.push(reader.u8());
	return message;
}

function hintValue(type: number, value: number): number {
	const isDescription = type === HINT_DESC_ADD || type === HINT_DESC_REMOVE;
	return isDescription ? (ignisDescriptionToYgopro(value) ?? 0) : value;
}

const MONSTER_ZONES = 7;
const SPELL_ZONES = 8;

function readZoneCards(reader: IgnisReader, zones: number): YGOProMsgReloadField_ZoneCard[] {
	const cards: YGOProMsgReloadField_ZoneCard[] = [];
	for (let i = 0; i < zones; i++) {
		const card = new YGOProMsgReloadField_ZoneCard();
		card.occupied = reader.u8();
		if (card.occupied) {
			card.position = reader.u8();
			card.xyzCount = reader.u32();
		}
		cards.push(card);
	}

	return cards;
}

/**
 * The whole board, sent to a player who rejoins a duel. Ignis opens it with
 * the duel flags, where YGOPro has the Master Rule number, and counts every
 * pile in 32 bits.
 */
function decodeReloadField(reader: IgnisReader): YGOProMsgReloadField {
	const message = new YGOProMsgReloadField();
	message.duelRule = duelRuleFromFlags(reader.u32());
	message.players = [0, 1].map(() => {
		const player = new YGOProMsgReloadField_PlayerInfo();
		player.lp = reader.u32();
		player.mzone = readZoneCards(reader, MONSTER_ZONES);
		player.szone = readZoneCards(reader, SPELL_ZONES);
		player.deckCount = reader.u32();
		player.handCount = reader.u32();
		player.graveCount = reader.u32();
		player.removedCount = reader.u32();
		player.extraCount = reader.u32();
		player.extraPCount = reader.u32();

		return player;
	});
	message.chains = readList(reader, (r) => {
		const chain = new YGOProMsgReloadField_ChainInfo();
		chain.code = r.u32();
		chain.chainCardController = r.u8();
		chain.chainCardLocation = r.u8();
		chain.chainCardSequence = r.u32();
		chain.chainCardSubsequence = r.u32();
		chain.triggerController = r.u8();
		chain.triggerLocation = r.u8();
		chain.triggerSequence = r.u32();
		chain.desc = ignisDescriptionToYgopro(r.u64()) ?? 0;

		return chain;
	});

	return message;
}

function decodeCardHint(reader: IgnisReader): YGOProMsgCardHint {
	const message = readSubsequenceLocation(reader, new YGOProMsgCardHint());
	message.type = reader.u8();
	message.value = hintValue(message.type, reader.u64());
	return message;
}

function decodePlayerHint(reader: IgnisReader): YGOProMsgPlayerHint {
	const message = new YGOProMsgPlayerHint();
	message.player = reader.u8();
	message.type = reader.u8();
	message.value = hintValue(message.type, reader.u64());
	return message;
}

export const EVENT_DECODERS: Readonly<Record<number, Decoder>> = {
	30: decodeConfirmDeckTop,
	31: decodeConfirmCards,
	32: decodeShuffleDeck,
	33: (reader) => readShuffledCodes(reader, new YGOProMsgShuffleHand()),
	35: decodeSwapGraveDeck,
	36: decodeShuffleSetCard,
	37: () => new YGOProMsgReverseDeck(),
	38: decodeDeckTop,
	39: (reader) => readShuffledCodes(reader, new YGOProMsgShuffleExtra()),
	42: decodeConfirmExtraTop,
	54: (reader) => readCodeAndLocation(reader, new YGOProMsgSet()),
	55: decodeSwap,
	56: decodeFieldDisabled,
	62: (reader) => readCodeAndLocation(reader, new YGOProMsgSpSummoning()),
	63: () => new YGOProMsgSpSummoned(),
	64: (reader) => readCodeAndLocation(reader, new YGOProMsgFlipSummoning()),
	65: () => new YGOProMsgFlipSummoned(),
	70: decodeChaining,
	71: (reader) => readChainCount(reader, new YGOProMsgChained()),
	72: (reader) => readChainCount(reader, new YGOProMsgChainSolving()),
	73: (reader) => readChainCount(reader, new YGOProMsgChainSolved()),
	74: () => new YGOProMsgChainEnd(),
	75: (reader) => readChainCount(reader, new YGOProMsgChainNegated()),
	76: (reader) => readChainCount(reader, new YGOProMsgChainDisabled()),
	81: decodeRandomSelected,
	83: decodeBecomeTarget,
	93: decodeEquip,
	96: decodeCardTarget,
	97: decodeCancelTarget,
	101: (reader) => readCounterChange(reader, new YGOProMsgAddCounter()),
	102: (reader) => readCounterChange(reader, new YGOProMsgRemoveCounter()),
	120: decodeMissedEffect,
	130: (reader) => readToss(reader, new YGOProMsgTossCoin()),
	131: (reader) => readToss(reader, new YGOProMsgTossDice()),
	160: decodeCardHint,
	162: decodeReloadField,
	165: decodePlayerHint,
};
