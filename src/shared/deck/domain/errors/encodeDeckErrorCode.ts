import { YGOProLFListError, YGOProLFListErrorReason } from "ygopro-lflist-encode";

/**
 * Encodes a deck error into the u32 `code` field of STOC_ERROR_MSG.
 *
 * Delegates to ygopro-lflist-encode's `YGOProLFListError.toPayload()` — the same
 * encoder SRVPro2 uses — so the bit layout stays canonical and shared across the
 * ecosystem instead of being re-implemented here:
 *   bits 31-28 → deck error type (YGOProLFListErrorReason / DeckErrorType 1..9)
 *   bits 27-0  → offending card id (0 when not applicable)
 *
 * The client decodes it back with `(code >>> 28) & 0xf` for the type and
 * `code & 0x0FFFFFFF` for the card id. Sending the type unshifted (the old bug)
 * made the client read type 0 and fall back to a generic "invalid deck" message
 * with no offending card.
 */
export function encodeDeckErrorCode(type: number, cardId: number): number {
	return new YGOProLFListError(type as YGOProLFListErrorReason, cardId).toPayload();
}
