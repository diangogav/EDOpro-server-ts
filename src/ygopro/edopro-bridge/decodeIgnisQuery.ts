import { CardQuery, CardQuery_CardLocation, CardQuery_Counter } from "ygopro-msg-encode";
import type { IgnisReader } from "./IgnisReader";

const QUERY_CODE = 0x1;
const QUERY_POSITION = 0x2;
const QUERY_ALIAS = 0x4;
const QUERY_TYPE = 0x8;
const QUERY_LEVEL = 0x10;
const QUERY_RANK = 0x20;
const QUERY_ATTRIBUTE = 0x40;
const QUERY_RACE = 0x80;
const QUERY_ATTACK = 0x100;
const QUERY_DEFENSE = 0x200;
const QUERY_BASE_ATTACK = 0x400;
const QUERY_BASE_DEFENSE = 0x800;
const QUERY_REASON = 0x1000;
const QUERY_REASON_CARD = 0x2000;
const QUERY_EQUIP_CARD = 0x4000;
const QUERY_TARGET_CARD = 0x8000;
const QUERY_OVERLAY_CARD = 0x10000;
const QUERY_COUNTERS = 0x20000;
const QUERY_OWNER = 0x40000;
const QUERY_STATUS = 0x80000;
const QUERY_LSCALE = 0x200000;
const QUERY_RSCALE = 0x400000;
const QUERY_LINK = 0x800000;
const QUERY_END = 0x8000_0000;

/**
 * Decode one card's query: a run of `[size:u16][flag:u32][value]` fields that
 * ends at QUERY_END. A leading size of 0 marks a slot with no card.
 *
 * Fields the YGOPro query has no place for (public/hidden markers, cover) are
 * skipped by their declared size, so a core that adds a field does not break
 * the fields after it.
 */
export function decodeIgnisQuery(reader: IgnisReader): CardQuery {
	const query = new CardQuery();
	query.flags = 0;

	for (;;) {
		const size = reader.u16();
		if (size === 0) {
			query.empty = true;
			return query;
		}
		const fieldStart = reader.offset;
		const flag = reader.u32();
		if (flag === QUERY_END) return query;

		if (readField(reader, flag, query)) query.flags = (query.flags | flag) >>> 0;

		const consumed = reader.offset - fieldStart;
		if (consumed > size) {
			throw new RangeError(
				`Ignis query: field 0x${flag.toString(16)} read ${consumed} bytes, declared ${size}`,
			);
		}
		reader.skip(size - consumed);
	}
}

/** Returns false for a field with no YGOPro counterpart; the caller skips it. */
function readField(reader: IgnisReader, flag: number, query: CardQuery): boolean {
	switch (flag) {
		case QUERY_CODE:
			query.code = reader.u32();
			return true;
		case QUERY_POSITION:
			query.position = reader.u32();
			return true;
		case QUERY_ALIAS:
			query.alias = reader.u32();
			return true;
		case QUERY_TYPE:
			query.type = reader.u32();
			return true;
		case QUERY_LEVEL:
			query.level = reader.u32();
			return true;
		case QUERY_RANK:
			query.rank = reader.u32();
			return true;
		case QUERY_ATTRIBUTE:
			query.attribute = reader.u32();
			return true;
		case QUERY_RACE:
			query.race = reader.u64();
			return true;
		case QUERY_ATTACK:
			query.attack = reader.i32();
			return true;
		case QUERY_DEFENSE:
			query.defense = reader.i32();
			return true;
		case QUERY_BASE_ATTACK:
			query.baseAttack = reader.i32();
			return true;
		case QUERY_BASE_DEFENSE:
			query.baseDefense = reader.i32();
			return true;
		case QUERY_REASON:
			query.reason = reader.u32();
			return true;
		case QUERY_REASON_CARD:
			query.reasonCard = readLocation(reader);
			return true;
		case QUERY_EQUIP_CARD:
			query.equipCard = readLocation(reader);
			return true;
		case QUERY_TARGET_CARD:
			query.targetCards = readList(reader, readLocation);
			return true;
		case QUERY_OVERLAY_CARD:
			query.overlayCards = readList(reader, (r) => r.u32());
			return true;
		case QUERY_COUNTERS:
			query.counters = readList(reader, readCounter);
			return true;
		case QUERY_OWNER:
			query.owner = reader.u8();
			return true;
		case QUERY_STATUS:
			query.status = reader.u32();
			return true;
		case QUERY_LSCALE:
			query.lscale = reader.u32();
			return true;
		case QUERY_RSCALE:
			query.rscale = reader.u32();
			return true;
		case QUERY_LINK:
			query.link = reader.u32();
			query.linkMarker = reader.u32();
			return true;
		default:
			return false;
	}
}

function readList<T>(reader: IgnisReader, readItem: (reader: IgnisReader) => T): T[] {
	const count = reader.u32();
	const items: T[] = [];
	for (let i = 0; i < count; i++) items.push(readItem(reader));
	return items;
}

function readLocation(reader: IgnisReader): CardQuery_CardLocation {
	const location = new CardQuery_CardLocation();
	location.controller = reader.u8();
	location.location = reader.u8();
	location.sequence = reader.u32();
	location.position = reader.u32();
	return location;
}

/** The core packs a counter as `type | count << 16`. */
function readCounter(reader: IgnisReader): CardQuery_Counter {
	const packed = reader.u32();
	const counter = new CardQuery_Counter();
	counter.type = packed & 0xffff;
	counter.count = packed >>> 16;
	return counter;
}
