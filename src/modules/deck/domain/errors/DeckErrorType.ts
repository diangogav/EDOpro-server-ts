export enum DeckErrorType {
	CARD_BANLISTED = 0x01,
	CARD_OCG_ONLY = 0x2,
	CARD_TCG_ONLY = 0x3,
	CARD_UNKNOWN = 0x4, //TODO: Peding to implements
	CARD_MORE_THAN_3 = 0x5, //TODO: Peding to implements
	DECK_BAD_MAIN_COUNT = 0x6,
	DECK_BAD_EXTRA_COUNT = 0x7,
	DECK_BAD_SIDE_COUNT = 0x8,
	CARD_FORBIDDEN_TYPE = 0x9, //TODO: Peding to implements
	CARD_UNOFFICIAL = 0xa,
	DECK_INVALID_SIZE = 0xb,
	DECK_TOO_MANY_LEGENDS = 0xc, //TODO: Peding to implements
	DECK_TOO_MANY_SKILLS = 0xd, //TODO: Peding to implements
}
