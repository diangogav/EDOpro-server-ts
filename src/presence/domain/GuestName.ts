export const GUEST_NAME_MAX_LENGTH = 20;

const CONTROL_CHARACTERS = /\p{Cc}/u;

/**
 * The name a guest shows in the online list: trimmed, inner whitespace
 * collapsed, 1 to 20 characters, no control characters. Null when the input
 * cannot be shown.
 */
export function normalizeGuestName(value: unknown): string | null {
	if (typeof value !== "string" || CONTROL_CHARACTERS.test(value)) {
		return null;
	}

	const name = value.trim().replace(/\s+/g, " ");
	const length = Array.from(name).length;

	return length >= 1 && length <= GUEST_NAME_MAX_LENGTH ? name : null;
}
