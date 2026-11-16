const CARD_CODE_SHIFT = 0x10_0000;
const YGOPRO_STRINGS_PER_CARD = 16;

const UINT32_RANGE = 0x1_0000_0000;

/**
 * The Ignis core packs an effect description as `code << 20 | index`; a YGOPro
 * client reads `code * 16 + index` from a 32-bit field. System strings
 * (code 0) are the same number in both.
 *
 * The product overflows 32 bits for a code from 134,217,728 up. The YGOPro
 * core truncates it there, and clients key their texts by that truncated
 * value, so this does the same.
 *
 * Returns null when the index does not fit the 16 strings a card row holds,
 * so the caller decides how to degrade instead of showing another card's text.
 */
export function ignisDescriptionToYgopro(description: number): number | null {
	const code = Math.floor(description / CARD_CODE_SHIFT);
	const index = description % CARD_CODE_SHIFT;
	if (code === 0) return index;
	if (index >= YGOPRO_STRINGS_PER_CARD) return null;
	return (code * YGOPRO_STRINGS_PER_CARD + index) % UINT32_RANGE;
}
