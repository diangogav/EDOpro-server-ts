/** Byte builders for a card query as the Ignis core writes it. */
export const QUERY_CODE = 0x1;
export const QUERY_POSITION = 0x2;
export const QUERY_END = 0x8000_0000;

export function u16(value: number): number[] {
	return [value & 0xff, (value >>> 8) & 0xff];
}

export function u32(value: number): number[] {
	return [...u16(value & 0xffff), ...u16(value >>> 16)];
}

/** One `[size][flag][value]` field as the core writes it. */
export function field(flag: number, value: number[] = []): number[] {
	return [...u16(4 + value.length), ...u32(flag), ...value];
}

export const END = field(QUERY_END);
export const EMPTY_SLOT = u16(0);
