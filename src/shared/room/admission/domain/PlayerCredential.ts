/**
 * Who is knocking at the room's door, and with which key.
 *
 * - `verified`: authenticated via the strong handshake ticket (evolution client).
 * - `external`: authenticated via the legacy 4-char PIN carried in the nickname.
 * - `guest`:    no valid credential — only a display name.
 *
 * `verified` and `external` carry the SAME account id; what differs is how
 * strongly it was proven. `guest` carries no identity at all.
 */
export type PlayerCredential =
	| { readonly kind: "verified"; readonly userId: string }
	| { readonly kind: "external"; readonly userId: string }
	| { readonly kind: "guest"; readonly name: string };
