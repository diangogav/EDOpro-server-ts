import type { YGOProMsgBase } from "ygopro-msg-encode";
import { ignisDescriptionToYgopro } from "./ignis-description";
import type { IgnisReader } from "./IgnisReader";

export interface IgnisTranslationContext {
	/** Master Rule of the room; the EDOPro MSG_START does not carry it. */
	readonly duelRule: number;
}

export type Decoder = (reader: IgnisReader, context: IgnisTranslationContext) => YGOProMsgBase;

export interface CardLocation {
	controller: number;
	location: number;
	sequence: number;
	position: number;
}

/**
 * The core's 10-byte card location. For an overlay material `position` holds
 * its index under the host, the same convention the YGOPro location uses.
 */
export function readLocation<T extends CardLocation>(reader: IgnisReader, target: T): T {
	target.controller = reader.u8();
	target.location = reader.u8();
	target.sequence = reader.u32();
	target.position = reader.u32();
	return target;
}

interface SubsequenceLocation {
	controller: number;
	location: number;
	sequence: number;
	subsequence: number;
}

/** Same 10 bytes, for the YGOPro shapes that name the fourth field `subsequence`. */
export function readSubsequenceLocation<T extends SubsequenceLocation>(
	reader: IgnisReader,
	target: T,
): T {
	target.controller = reader.u8();
	target.location = reader.u8();
	target.sequence = reader.u32();
	target.subsequence = reader.u32();
	return target;
}

/**
 * A location as the single 32-bit word YGOPro packs it into:
 * controller, location, sequence and position one byte each.
 */
export function readPackedLocation(reader: IgnisReader): number {
	const controller = reader.u8();
	const location = reader.u8();
	const sequence = reader.u32();
	const position = reader.u32();
	return (
		(controller | (location << 8) | ((sequence & 0xff) << 16) | ((position & 0xff) << 24)) >>> 0
	);
}

/** Reads `count` items, where the count is the 32-bit value the core writes. */
export function readList<T>(reader: IgnisReader, readItem: (reader: IgnisReader) => T): T[] {
	const count = reader.u32();
	const items: T[] = [];
	for (let i = 0; i < count; i++) items.push(readItem(reader));
	return items;
}

interface ActivatableCard {
	code: number;
	controller: number;
	location: number;
	sequence: number;
	desc: number;
}

/** Activatable effects, laid out the same in the idle and battle prompts. */
export function readActivatableCards<T extends ActivatableCard>(
	reader: IgnisReader,
	create: () => T,
): T[] {
	const count = reader.u32();
	const cards: T[] = [];
	for (let i = 0; i < count; i++) {
		const card = create();
		card.code = reader.u32();
		card.controller = reader.u8();
		card.location = reader.u8();
		card.sequence = reader.u32();
		card.desc = ignisDescriptionToYgopro(reader.u64()) ?? 0;
		reader.skip(1); // client mode (EDOPro-only activation hint)
		cards.push(card);
	}
	return cards;
}
