import { EventEmitter } from "stream";

import { LoggerMock } from "@test-support/mocks/logger/LoggerMock";
import { MessageRepositoryMock } from "@test-support/mocks/MessageRepositoryMock";
import { PlayerInfoMessageMother } from "@test-support/mothers/PlayerInfoMessageMother";

import { YGOProRoom } from "./YGOProRoom";

/**
 * YGOProRoom.create() validates against RULE_MAPPING_TIERS, a module-level
 * snapshot computed ONCE at import via `Object.values(...)`. Because the tier
 * arrays are a module-level snapshot, reproducing a same-tier double match
 * requires mocking "./RuleMappings" BEFORE YGOProRoom is first imported —
 * mutating the real exported objects at test time (as a normal test would)
 * is not observed by YGOProRoom's cached tiers.
 */
describe("YGOProRoom.create — same-tier double match (isolated RuleMappings mock)", () => {
	afterEach(() => {
		jest.resetModules();
	});

	it("throws when two validators in the SAME tier match the same token", () => {
		jest.isolateModules(() => {
			jest.doMock("./RuleMappings", () => {
				const actual = jest.requireActual("./RuleMappings");
				return {
					...actual,
					// "ot" already validates "tcg" in the real priority tier; adding a
					// second entry that also validates "tcg" reproduces a same-tier
					// double match without touching any real, shipped rule token.
					priorityRuleMappings: {
						...actual.priorityRuleMappings,
						__testDuplicateTcg: {
							get: () => ({}),
							validate: (value: string) => value === "tcg",
						},
					},
				};
			});

			// biome-ignore lint/style/noCommonJs: require inside jest.isolateModules re-evaluates the module graph after doMock
			const { YGOProRoom } = require("./YGOProRoom");
			// biome-ignore lint/style/noCommonJs: require inside jest.isolateModules re-evaluates the module graph after doMock
			const { LoggerMock } = require("@test-support/mocks/logger/LoggerMock");
			// biome-ignore lint/style/noCommonJs: require inside jest.isolateModules re-evaluates the module graph after doMock
			const { MessageRepositoryMock } = require("@test-support/mocks/MessageRepositoryMock");
			// biome-ignore lint/style/noCommonJs: require inside jest.isolateModules re-evaluates the module graph after doMock
			const { PlayerInfoMessageMother } = require("@test-support/mothers/PlayerInfoMessageMother");

			expect(() =>
				YGOProRoom.create(
					1,
					"tcg#123",
					new LoggerMock(),
					new EventEmitter(),
					PlayerInfoMessageMother.create(),
					"sock-1",
					new MessageRepositoryMock(),
				),
			).toThrow("Error: param match with two rules.");
		});
	});

	it("does NOT throw when the duplicate validator is injected into a DIFFERENT tier than the matched token", () => {
		jest.isolateModules(() => {
			jest.doMock("./RuleMappings", () => {
				const actual = jest.requireActual("./RuleMappings");
				return {
					...actual,
					// Duplicate lives in the FORMAT tier; "tcg" is matched by the
					// PRIORITY tier's "ot" entry — different tiers, so no throw.
					formatRuleMappings: {
						...actual.formatRuleMappings,
						__testDuplicateTcg: {
							get: () => ({}),
							validate: (value: string) => value === "tcg",
						},
					},
				};
			});

			// biome-ignore lint/style/noCommonJs: require inside jest.isolateModules re-evaluates the module graph after doMock
			const { YGOProRoom } = require("./YGOProRoom");
			// biome-ignore lint/style/noCommonJs: require inside jest.isolateModules re-evaluates the module graph after doMock
			const { LoggerMock } = require("@test-support/mocks/logger/LoggerMock");
			// biome-ignore lint/style/noCommonJs: require inside jest.isolateModules re-evaluates the module graph after doMock
			const { MessageRepositoryMock } = require("@test-support/mocks/MessageRepositoryMock");
			// biome-ignore lint/style/noCommonJs: require inside jest.isolateModules re-evaluates the module graph after doMock
			const { PlayerInfoMessageMother } = require("@test-support/mothers/PlayerInfoMessageMother");

			expect(() =>
				YGOProRoom.create(
					2,
					"tcg#123",
					new LoggerMock(),
					new EventEmitter(),
					PlayerInfoMessageMother.create(),
					"sock-2",
					new MessageRepositoryMock(),
				),
			).not.toThrow();
		});
	});

	// The mocked-RuleMappings suite above proves same-tier vs cross-tier
	// double-match detection with SYNTHETIC validators. This characterizes
	// the actual production precedence rule (later tier wins for the same
	// hostInfo key) with REAL shipping tokens, unmocked, so a regression that
	// silently reordered RULE_MAPPING_TIERS would be caught here even though
	// neither token throws.
	//
	// "ocg" (format tier) sets rule=0; "ot"/"tcg" (priority tier) sets
	// rule=5. Deliberately NOT the "pre,ot" pair sometimes used as a
	// shorthand example elsewhere: "pre" (format) ALSO sets rule=5, so
	// "pre,ot" can't distinguish "priority tier ran after format tier" from
	// "tier order was reversed" — both give the same final value either way.
	// "ocg,ot" can, because format and priority disagree (0 vs 5).
	describe("tier precedence with real shipping tokens (non-mocked)", () => {
		it('"ocg,ot" — the priority tier\'s "ot" overwrites the format tier\'s "ocg" rule (priority runs LAST)', () => {
			const room = YGOProRoom.create(
				3,
				"ocg,ot#123",
				new LoggerMock(),
				new EventEmitter(),
				PlayerInfoMessageMother.create(),
				"sock-3",
				new MessageRepositoryMock(),
			);

			expect(room.hostInfo.rule).toBe(5);
		});

		it('token order does not change the outcome — "ot,ocg" resolves the same as "ocg,ot" (tiers, not token order, decide precedence)', () => {
			const room = YGOProRoom.create(
				4,
				"ot,ocg#123",
				new LoggerMock(),
				new EventEmitter(),
				PlayerInfoMessageMother.create(),
				"sock-4",
				new MessageRepositoryMock(),
			);

			expect(room.hostInfo.rule).toBe(5);
		});
	});
});
