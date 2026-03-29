import { Card } from "@shared/card/domain/Card";
import { CardRepository } from "@shared/card/domain/CardRepository";
import { YGOProResourceLoader } from "@ygopro/ygopro";

export class CardYGOProRepository implements CardRepository {
    async findByCode(code: string): Promise<Card | null> {
        const loader = YGOProResourceLoader.get();
        const cardReader = await loader.getCardReader();
        const card = cardReader(+code);
        if (
            !card ||
            card?.alias === null || card?.alias === undefined ||
            card?.code === null || card?.code === undefined ||
            card?.type === null || card?.type === undefined ||
            card?.ot === null || card?.ot === undefined ||
            card?.category === null || card?.category === undefined
        ) {
            return null;
        }

        return new Card({
            alias: card.alias.toString(),
            code: card.code.toString(),
            type: card.type,
            category: card.category ?? 0,
            variant: card.ot
        })
    }
}
