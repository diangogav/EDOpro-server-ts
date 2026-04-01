import "reflect-metadata";

import { Card, ScopeCode } from "../../../../../../src/shared/card/domain/Card";
import { Deck } from "../../../../../../src/shared/deck/domain/Deck";
import { Rule } from "../../../../../../src/shared/deck/domain/Rule";
import { DeckErrorType } from "../../../../../../src/shared/deck/domain/errors/DeckErrorType";
import { CardAvailabilityValidationHandler } from "../../../../../../src/mercury/deck/domain/validators/CardAvailabilityValidationHandler";

function createCard(code: number, variant: number): Card {
  return new Card({ alias: "0", code: String(code), type: 0, category: 0, variant });
}

function createDeck(cards: Card[]): Deck {
  return { main: cards, side: [], extra: [], allCards: cards } as unknown as Deck;
}

function validate(rule: Rule, variant: number): ReturnType<CardAvailabilityValidationHandler["validate"]> {
  const handler = new CardAvailabilityValidationHandler(rule);
  const deck = createDeck([createCard(12345, variant)]);
  return handler.validate(deck);
}

describe("CardAvailabilityValidationHandler", () => {
  describe("TCG only (rule 1)", () => {
    it("should accept a TCG card", () => {
      expect(validate(Rule.ONLY_TCG, ScopeCode.TCG)).toBeNull();
    });

    it("should reject an OCG-only card", () => {
      const error = validate(Rule.ONLY_TCG, ScopeCode.OCG);
      expect(error).not.toBeNull();
      expect(error!.type).toBe(DeckErrorType.CARD_OCG_ONLY);
    });

    it("should reject a pre-release TCG card", () => {
      const error = validate(Rule.ONLY_TCG, ScopeCode.TCG | ScopeCode.PRERELEASE);
      expect(error).not.toBeNull();
      expect(error!.type).toBe(DeckErrorType.CARD_UNOFFICIAL);
    });

    it("should accept an OCG+TCG card", () => {
      expect(validate(Rule.ONLY_TCG, ScopeCode.OCG_TCG)).toBeNull();
    });
  });

  describe("OCG only (rule 0)", () => {
    it("should accept an OCG card", () => {
      expect(validate(Rule.ONLY_OCG, ScopeCode.OCG)).toBeNull();
    });

    it("should reject a TCG-only card", () => {
      const error = validate(Rule.ONLY_OCG, ScopeCode.TCG);
      expect(error).not.toBeNull();
      expect(error!.type).toBe(DeckErrorType.CARD_TCG_ONLY);
    });

    it("should reject a pre-release OCG card", () => {
      const error = validate(Rule.ONLY_OCG, ScopeCode.OCG | ScopeCode.PRERELEASE);
      expect(error).not.toBeNull();
      expect(error!.type).toBe(DeckErrorType.CARD_UNOFFICIAL);
    });
  });

  describe("OCG+TCG (rule 2)", () => {
    it("should accept an OCG+TCG card", () => {
      expect(validate(Rule.OCG_TCG, ScopeCode.OCG_TCG)).toBeNull();
    });

    it("should reject a pre-release card", () => {
      const error = validate(Rule.OCG_TCG, ScopeCode.OCG | ScopeCode.TCG | ScopeCode.PRERELEASE);
      expect(error).not.toBeNull();
      expect(error!.type).toBe(DeckErrorType.CARD_UNOFFICIAL);
    });
  });

  describe("PRE_RELEASE (rule 3)", () => {
    it("should accept a pre-release TCG card", () => {
      expect(validate(Rule.PRE_RELEASE, ScopeCode.TCG | ScopeCode.PRERELEASE)).toBeNull();
    });

    it("should accept a pre-release OCG card", () => {
      expect(validate(Rule.PRE_RELEASE, ScopeCode.OCG | ScopeCode.PRERELEASE)).toBeNull();
    });

    it("should accept a regular OCG+TCG card", () => {
      expect(validate(Rule.PRE_RELEASE, ScopeCode.OCG_TCG)).toBeNull();
    });
  });

  describe("ALL (rule 4)", () => {
    it("should accept any card including pre-release", () => {
      expect(validate(Rule.ALL, ScopeCode.TCG | ScopeCode.PRERELEASE)).toBeNull();
    });

    it("should accept a regular card", () => {
      expect(validate(Rule.ALL, ScopeCode.TCG)).toBeNull();
    });
  });

  describe("ANIME cards bypass", () => {
    it("should accept an ANIME card regardless of rule", () => {
      expect(validate(Rule.ONLY_TCG, ScopeCode.ANIME)).toBeNull();
    });
  });
});
