import YGOProDeck from 'ygopro-deck-encode';

/**
 * 比较两个卡组是否相等
 * 使用 toUpdateDeckPayload 转换为 buffer 然后比较
 * 这是与 srvpro 一致的比较方法
 */
export function deckEquals(
    deck1: YGOProDeck,
    deck2: YGOProDeck,
): boolean {
    const normalizedDeck1 = YGOProDeck.fromUpdateDeckPayload(
        deck1.toUpdateDeckPayload(),
    );
    const normalizedDeck2 = YGOProDeck.fromUpdateDeckPayload(
        deck2.toUpdateDeckPayload(),
    );
    return normalizedDeck1.isEqual(normalizedDeck2, { ignoreOrder: true });
}
