import { CardReader } from 'koishipro-core.js';
import YGOProDeck from 'ygopro-deck-encode';
import {
    YGOProLFListError,
    YGOProLFListErrorReason,
    YGOProLFListItem,
} from 'ygopro-lflist-encode';
import { OcgcoreCommonConstants } from 'ygopro-msg-encode';
import { readCardWithReader } from './read-card-with-reader';

// Constants from ygopro
const { TYPES_EXTRA_DECK, TYPE_TOKEN } = OcgcoreCommonConstants;
const AVAIL_OCG = 0x1;
const AVAIL_TCG = 0x2;
const AVAIL_CUSTOM = 0x4;
const AVAIL_SC = 0x8;
const AVAIL_OCGTCG = AVAIL_OCG | AVAIL_TCG;

export const checkDeck = (
    deck: YGOProDeck,
    reader: CardReader,
    options: {
        ot?: number; // default 5 (AVAIL_OCGTCG)
        lflist?: YGOProLFListItem;
        minMain?: number; // default 40
        maxMain?: number; // default 60
        maxExtra?: number; // default 15
        maxSide?: number; // default 15
        maxCopies?: number; // default 3
    } = {},
): YGOProLFListError | null => {
    const {
        ot = 5,
        lflist,
        minMain = 40,
        maxMain = 60,
        maxExtra = 15,
        maxSide = 15,
        maxCopies = 3,
    } = options;

    // Check deck size constraints
    if (deck.main.length < minMain || deck.main.length > maxMain) {
        return new YGOProLFListError(
            YGOProLFListErrorReason.MAINCOUNT,
            deck.main.length,
        );
    }

    if (deck.extra.length > maxExtra) {
        return new YGOProLFListError(
            YGOProLFListErrorReason.EXTRACOUNT,
            deck.extra.length,
        );
    }

    if (deck.side.length > maxSide) {
        return new YGOProLFListError(
            YGOProLFListErrorReason.SIDECOUNT,
            deck.side.length,
        );
    }

    // Map rule to availability flags
    const rule_map = [
        AVAIL_OCG,
        AVAIL_TCG,
        AVAIL_SC,
        AVAIL_CUSTOM,
        AVAIL_OCGTCG,
        0,
    ];
    const avail = ot >= 0 && ot < rule_map.length ? rule_map[ot] : 0;

    // Helper function to check card availability
    const checkAvail = (
        cardOt: number,
        availFlag: number,
    ): YGOProLFListErrorReason | null => {
        if (cardOt & 0x4) {
            return null; // AVAIL_CUSTOM
        }
        if ((cardOt & availFlag) === availFlag) {
            return null;
        }
        if (cardOt & AVAIL_OCG && availFlag !== AVAIL_OCG) {
            return YGOProLFListErrorReason.OCGONLY;
        }
        if (cardOt & AVAIL_TCG && availFlag !== AVAIL_TCG) {
            return YGOProLFListErrorReason.TCGONLY;
        }
        return YGOProLFListErrorReason.NOTAVAIL;
    };

    // Count cards by code (using alias if available)
    const cardCount = new Map<number, number>();
    // Collect all card codes (with alias) for lflist check
    const allCardCodes: number[] = [];

    // Helper to process a single card
    const processCard = (
        code: number,
        location: 'main' | 'extra' | 'side',
    ): YGOProLFListError | null => {
        const cardData = readCardWithReader(reader, code);

        if (!cardData) {
            return new YGOProLFListError(YGOProLFListErrorReason.UNKNOWNCARD, code);
        }

        // Check availability
        const availError = checkAvail(cardData.ot ?? 0, avail);
        if (availError !== null) {
            return new YGOProLFListError(availError, code);
        }

        // Check card type constraints
        const cardType = cardData.type ?? 0;

        if (location === 'main') {
            if (cardType & (TYPES_EXTRA_DECK | TYPE_TOKEN)) {
                return new YGOProLFListError(YGOProLFListErrorReason.MAINCOUNT, code);
            }
        } else if (location === 'extra') {
            if (!(cardType & TYPES_EXTRA_DECK) || cardType & TYPE_TOKEN) {
                return new YGOProLFListError(YGOProLFListErrorReason.EXTRACOUNT, code);
            }
        } else if (location === 'side') {
            if (cardType & TYPE_TOKEN) {
                return new YGOProLFListError(YGOProLFListErrorReason.SIDECOUNT, code);
            }
        }

        // Count cards (use ruleCode/alias if available)
        const countCode = cardData.ruleCode || cardData.alias || code;
        const count = (cardCount.get(countCode) || 0) + 1;
        cardCount.set(countCode, count);

        // Collect card code for lflist check
        allCardCodes.push(countCode);

        // Check max copies
        if (count > maxCopies) {
            return new YGOProLFListError(YGOProLFListErrorReason.CARDCOUNT, code);
        }

        return null;
    };

    // Check all cards in main deck
    for (const code of deck.main) {
        const error = processCard(code, 'main');
        if (error) {
            return error;
        }
    }

    // Check all cards in extra deck
    for (const code of deck.extra) {
        const error = processCard(code, 'extra');
        if (error) {
            return error;
        }
    }

    // Check all cards in side deck
    for (const code of deck.side) {
        const error = processCard(code, 'side');
        if (error) {
            return error;
        }
    }

    // Check forbidden/limited list if provided
    if (lflist) {
        const lflistError = lflist.checkDeck(allCardCodes);
        if (lflistError) {
            return lflistError;
        }
    }

    return null;
};

export const checkChangeSide = (
    oldDeck: YGOProDeck,
    newDeck: YGOProDeck,
): boolean => {
    // Helper function to count all cards in a deck
    const countCards = (deck: YGOProDeck): Map<number, number> => {
        const count = new Map<number, number>();
        for (const code of [...deck.main, ...deck.extra, ...deck.side]) {
            count.set(code, (count.get(code) || 0) + 1);
        }
        return count;
    };

    // Check deck sizes remain the same
    if (
        (['main', 'extra', 'side'] as const).some(
            (part) => newDeck[part].length !== oldDeck[part].length,
        )
    ) {
        return false;
    }

    // Count cards in both decks
    const oldCount = countCards(oldDeck);
    const newCount = countCards(newDeck);

    // Collect all unique card codes
    const allCodes = new Set<number>([...oldCount.keys(), ...newCount.keys()]);

    // Check that each card count is the same
    for (const code of allCodes) {
        if ((oldCount.get(code) || 0) !== (newCount.get(code) || 0)) {
            return false;
        }
    }

    return true;
};
