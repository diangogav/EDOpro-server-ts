import { Card } from "@shared/card/domain/Card";
import { CardRepository } from "@shared/card/domain/CardRepository";
import { Deck } from "@shared/deck/domain/Deck";
import { Logger } from "@shared/logger/domain/Logger";
import { DeckRules } from "@shared/room/domain/YgoRoom";
import { YGOProBanList } from "@ygopro/ban-list/domain/YGOProBanList";
import YGOProBanListMemoryRepository from "@ygopro/ban-list/infrastructure/MercuryBanListMemoryRepository";
import { OcgcoreCommonConstants } from "ygopro-msg-encode";

export class YGOProDeckCreator {
    private readonly cardRepository: CardRepository;
    private readonly deckRules: DeckRules;
    private readonly logger: Logger;

    constructor(cardRepositoy: CardRepository, deckRules: DeckRules, logger: Logger) {
        this.cardRepository = cardRepositoy;
        this.deckRules = deckRules;
        this.logger = logger;
    }

    async build({
        main,
        side,
        banListHash,
    }: {
        main: number[];
        side: number[];
        banListHash: number;
    }): Promise<Deck> {
        const mainDeck: Card[] = [];
        const extraDeck: Card[] = [];
        const sideDeck: Card[] = [];

        for (const cardId of main) {
            const card = await this.cardRepository.findByCode(cardId.toString());
            if (!card) {
                this.logger.warn(`Card with code ${cardId} not found.`);
                continue;
            }

            if (card?.type && card?.type & OcgcoreCommonConstants.TYPES_EXTRA_DECK) {
                extraDeck.push(card);
            } else {
                mainDeck.push(card);
            }
        }

        for (const cardId of side) {
            const card = await this.cardRepository.findByCode(cardId.toString());
            if (!card) {
                continue;
            }
            sideDeck.push(card);
        }

        const banList = YGOProBanListMemoryRepository.findByHash(banListHash);

        return new Deck({
            main: mainDeck,
            extra: extraDeck,
            side: sideDeck,
            banList: banList ?? new YGOProBanList(),
            deckRules: this.deckRules,
        });
    }
}
