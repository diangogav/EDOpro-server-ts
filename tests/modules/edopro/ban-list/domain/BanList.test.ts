import { EdoproBanList } from "../../../../../src/edopro/ban-list/domain/BanList";

describe("EdoproBanList", () => {
  let banList: EdoproBanList;

  beforeEach(() => {
    banList = new EdoproBanList();
  });

  describe("add", () => {
    it("should ignore NaN cardId", () => {
      banList.add(NaN, 1);
      expect(banList.limited).toHaveLength(0);
    });

    it("should add to forbidden list when quantity is 0", () => {
      const cardId = 123;
      banList.add(cardId, 0);
      expect(banList.forbidden).toContain(cardId);
      expect(banList.limited).not.toContain(cardId);
      expect(banList.semiLimited).not.toContain(cardId);
      expect(banList.all).not.toContain(cardId);
    });

    it("should add to limited list when quantity is 1", () => {
      const cardId = 456;
      banList.add(cardId, 1);
      expect(banList.forbidden).not.toContain(cardId);
      expect(banList.limited).toContain(cardId);
      expect(banList.semiLimited).not.toContain(cardId);
      expect(banList.all).not.toContain(cardId);
    });

    it("should add to semiLimited list when quantity is 2", () => {
      const cardId = 789;
      banList.add(cardId, 2);
      expect(banList.forbidden).not.toContain(cardId);
      expect(banList.limited).not.toContain(cardId);
      expect(banList.semiLimited).toContain(cardId);
      expect(banList.all).not.toContain(cardId);
    });

    it("should add to all list when quantity is 3", () => {
      const cardId = 101112;
      banList.add(cardId, 3);
      expect(banList.forbidden).not.toContain(cardId);
      expect(banList.limited).not.toContain(cardId);
      expect(banList.semiLimited).not.toContain(cardId);
      expect(banList.all).toContain(cardId);
    });

    it("should update hash when adding a card", () => {
      const initialHash = banList.hash;
      banList.add(123, 1);
      expect(banList.hash).not.toBe(initialHash);
    });
  });

  describe("isGenesys", () => {
    it("should return true if name is Genesys", () => {
      banList.setName("Genesys");
      expect(banList.isGenesys()).toBe(true);
    });

    it("should return false if name is not Genesys", () => {
      banList.setName("OCG");
      expect(banList.isGenesys()).toBe(false);
    });
  });
});
