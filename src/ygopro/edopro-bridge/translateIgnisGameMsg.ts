import type { YGOProMsgBase } from "ygopro-msg-encode";

import { BATTLE_DECODERS } from "./ignis-battle-decoders";
import { CORE_DECODERS } from "./ignis-core-decoders";
import type { Decoder, IgnisTranslationContext } from "./ignis-fields";
import { IgnisReader } from "./IgnisReader";

export type { IgnisTranslationContext } from "./ignis-fields";

export type IgnisTranslation =
	| { readonly kind: "message"; readonly message: YGOProMsgBase }
	/** A message the client has no use for; dropping it loses nothing. */
	| { readonly kind: "ignored"; readonly messageType: number }
	| { readonly kind: "unsupported"; readonly messageType: number };

/**
 * Bookkeeping the core emits that a YGOPro client derives from other
 * messages: card selected (80), chain target (121), relations (122, 123).
 */
const IGNORED_MESSAGES: ReadonlySet<number> = new Set([80, 121, 122, 123]);

const DECODERS: Readonly<Record<number, Decoder>> = {
	...CORE_DECODERS,
	...BATTLE_DECODERS,
};

/**
 * Translate one Ignis core game message (first byte = MSG id) into the
 * message object a YGOPro client decodes.
 */
export function translateIgnisGameMsg(
	payload: Uint8Array,
	context: IgnisTranslationContext,
): IgnisTranslation {
	const reader = new IgnisReader(payload);
	const messageType = reader.u8();
	if (IGNORED_MESSAGES.has(messageType)) return { kind: "ignored", messageType };
	const decode = DECODERS[messageType];
	if (decode === undefined) return { kind: "unsupported", messageType };

	return { kind: "message", message: decode(reader, context) };
}
