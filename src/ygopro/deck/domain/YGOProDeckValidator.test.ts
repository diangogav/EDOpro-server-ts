import { Card } from "@shared/card/domain/Card";
import { CardTypes } from "@shared/card/domain/CardTypes";
import { Deck } from "@shared/deck/domain/Deck";
import { CardMoreThan3Error } from "@shared/deck/domain/errors/CardMoreThan3Error";
import { MainDeckLimitError } from "@shared/deck/domain/errors/MainDeckLimitError";
import { OCGCardError } from "@shared/deck/domain/errors/OCGCardError";
import { Rule } from "@shared/deck/domain/Rule";
import { DeckRules } from "@shared/room/domain/YgoRoom";
import { EdoproBanList } from "@edopro/ban-list/domain/BanList";

import { YGOProRule } from "@ygopro/room/domain/host-info/YGOProRule";

import { YGOProDeckValidator } from "./YGOProDeckValidator";

function monster(code: string): Card {
	return new Card({ alias: "0", code, type: CardTypes.TYPE_MONSTER, category: 0, variant: 0 });
}

function genesysRules(maxDeckPoints: number): DeckRules {
	return new DeckRules({
		mainMin: 1,
		mainMax: 60,
		extraMin: 0,
		extraMax: 15,
		sideMin: 0,
		sideMax: 15,
		rule: 1,
		maxDeckPoints,
	});
}

function genesysBanList(points: Array<[number, number]>): EdoproBanList {
	const banList = new EdoproBanList();
	banList.setName("Genesys");
	for (const [code, cost] of points) {
		banList.add(code, 3, cost);
	}
	return banList;
}

describe("YGOProDeckValidator — Genesys", () => {
	it("rejects a deck whose point cost exceeds the cap", () => {
		const banList = genesysBanList([
			[100, 60],
			[200, 60],
		]);
		const validator = new YGOProDeckValidator(genesysRules(100), banList, YGOProRule.TCG);

		const deck = new Deck({
			main: [monster("100"), monster("200")],
			banList,
			deckRules: genesysRules(100),
		});
		const result = validator.validate(deck);

		expect(result).toBeInstanceOf(MainDeckLimitError);
	});

	it("rejects a deck with more than 3 copies of a zero-point card", () => {
		const banList = genesysBanList([]);
		const validator = new YGOProDeckValidator(genesysRules(100), banList, YGOProRule.TCG);

		const deck = new Deck({
			main: [monster("777"), monster("777"), monster("777"), monster("777")],
			banList,
			deckRules: genesysRules(100),
		});
		const result = validator.validate(deck);

		expect(result).toBeInstanceOf(CardMoreThan3Error);
	});

	it("accepts a deck within the point cap", () => {
		const banList = genesysBanList([[100, 40]]);
		const validator = new YGOProDeckValidator(genesysRules(100), banList, YGOProRule.TCG);

		const deck = new Deck({ main: [monster("100")], banList, deckRules: genesysRules(100) });
		const result = validator.validate(deck);

		expect(result).toBeNull();
	});
});

describe("YGOProDeckValidator — card availability", () => {
	it("checks cards against the room's YGOPro rule, not the EDOPro rule in DeckRules", () => {
		const banList = new EdoproBanList();
		const ocgOnly = new Card({
			alias: "0",
			code: "200",
			type: CardTypes.TYPE_MONSTER,
			category: 0,
			variant: 0x1,
		});
		const deckRules = new DeckRules({
			mainMin: 1,
			mainMax: 60,
			extraMin: 0,
			extraMax: 15,
			sideMin: 0,
			sideMax: 15,
			rule: Rule.ONLY_OCG,
			maxDeckPoints: 0,
		});
		const deck = new Deck({ main: [ocgOnly], banList, deckRules });

		const result = new YGOProDeckValidator(deckRules, banList, YGOProRule.NO_UNIQUE).validate(deck);

		expect(result).toBeInstanceOf(OCGCardError);
	});
});
