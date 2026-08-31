import { RankGroupsConfig } from "../domain/RankGroupConfig";
import { formatRankGroupsSummary } from "./RankGroupsSummary";

describe("formatRankGroupsSummary", () => {
	const config: RankGroupsConfig = {
		aliases: {},
		groups: [
			{ name: "TCG", enabled: true, onlyCurrent: true, members: ["* TCG"] },
			{ name: "OCG", enabled: true, onlyCurrent: true, members: ["* OCG"] },
			{ name: "Rush", enabled: true, onlyCurrent: true, members: ["* Rush Duel", "RD"] },
			{ name: "Speed", enabled: true, onlyCurrent: false, members: ["* Speed Duel"] },
		],
	};
	const loaded = ["2026.05 TCG", "2026.07 OCG", "2026.07.01 Rush Duel", "RD"];
	const today = new Date(Date.UTC(2026, 7, 31)); // 2026-08-31

	it("shows the lists feeding every enabled group in one boot-style line", () => {
		expect(formatRankGroupsSummary(config, loaded, today)).toBe(
			"🏆 Rank groups → TCG: 2026.05 TCG · OCG: 2026.07 OCG · Rush: 2026.07.01 Rush Duel + RD · Speed: (no loaded list)",
		);
	});

	it("omits disabled groups", () => {
		const withDisabled: RankGroupsConfig = {
			aliases: {},
			groups: [
				{ name: "TCG", enabled: true, onlyCurrent: true, members: ["* TCG"] },
				{ name: "Worlds", enabled: false, onlyCurrent: false, members: ["* Worlds"] },
			],
		};

		expect(formatRankGroupsSummary(withDisabled, loaded, today)).toBe(
			"🏆 Rank groups → TCG: 2026.05 TCG",
		);
	});

	it("shows only the current list, not retro or future-dated matches", () => {
		const names = ["2025.04 TCG", "2026.05 TCG", "2026.10 TCG"];

		expect(formatRankGroupsSummary(config, names, today)).toBe(
			"🏆 Rank groups → TCG: 2026.05 TCG · OCG: (no loaded list) · Rush: (no loaded list) · Speed: (no loaded list)",
		);
	});

	it("alias-resolves the loaded names before matching", () => {
		const aliased: RankGroupsConfig = {
			aliases: { "2011.09 Tengu Plant": "2011.09 Tengu" },
			groups: [{ name: "Tengu", enabled: true, onlyCurrent: true, members: ["* Tengu"] }],
		};

		expect(formatRankGroupsSummary(aliased, ["2011.09 Tengu Plant"], today)).toBe(
			"🏆 Rank groups → Tengu: 2011.09 Tengu",
		);
	});

	it("returns null when the config has no groups", () => {
		expect(formatRankGroupsSummary({ aliases: {}, groups: [] }, loaded, today)).toBeNull();
	});

	it("returns null when every group is disabled", () => {
		const allDisabled: RankGroupsConfig = {
			aliases: {},
			groups: [{ name: "Worlds", enabled: false, onlyCurrent: false, members: ["* Worlds"] }],
		};

		expect(formatRankGroupsSummary(allDisabled, loaded, today)).toBeNull();
	});
});
