import { mock, MockProxy } from "jest-mock-extended";
import { Logger } from "@shared/logger/domain/Logger";

import { RankGroupsConfig } from "../domain/RankGroupConfig";
import { RankGroupRepository } from "../domain/RankGroupRepository";
import { RankGroupSeeder } from "./RankGroupSeeder";

describe("RankGroupSeeder", () => {
	let repository: MockProxy<RankGroupRepository>;
	let logger: MockProxy<Logger>;
	let seeder: RankGroupSeeder;

	const config: RankGroupsConfig = {
		aliases: {},
		groups: [
			{ name: "TCG", enabled: true, onlyCurrent: true, members: ["* TCG"] },
			{ name: "Rush", enabled: true, onlyCurrent: true, members: ["* Rush Duel", "RD"] },
		],
	};

	beforeEach(() => {
		repository = mock<RankGroupRepository>();
		logger = mock<Logger>();
		logger.child.mockReturnValue(logger);
		repository.findGroupNames.mockResolvedValue([]);
		repository.upsertGroup.mockImplementation(async (group) => ({ id: `id-${group.name}` }));
		seeder = new RankGroupSeeder(repository, logger);
	});

	it("upserts every configured group and replaces its members", async () => {
		await seeder.seed(config);

		expect(repository.upsertGroup).toHaveBeenCalledWith({
			name: "TCG",
			enabled: true,
			onlyCurrent: true,
		});
		expect(repository.upsertGroup).toHaveBeenCalledWith({
			name: "Rush",
			enabled: true,
			onlyCurrent: true,
		});
		expect(repository.replaceMembers).toHaveBeenCalledWith("id-TCG", ["* TCG"]);
		expect(repository.replaceMembers).toHaveBeenCalledWith("id-Rush", ["* Rush Duel", "RD"]);
	});

	it("warns and skips a group whose name collides with a non-group rank", async () => {
		repository.upsertGroup.mockImplementation(async (group) =>
			group.name === "TCG" ? null : { id: `id-${group.name}` },
		);

		await seeder.seed(config);

		expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('"TCG"'));
		expect(repository.replaceMembers).not.toHaveBeenCalledWith("id-TCG", expect.anything());
		expect(repository.replaceMembers).toHaveBeenCalledWith("id-Rush", ["* Rush Duel", "RD"]);
	});

	it("warns about group ranks absent from the config without deleting them", async () => {
		repository.findGroupNames.mockResolvedValue(["TCG", "Legacy Ladder"]);

		await seeder.seed(config);

		expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining("Legacy Ladder"));
		// Only upserts and member replacement — the seeder owns no delete operation.
		expect(repository.upsertGroup).toHaveBeenCalledTimes(2);
	});

	it("logs one boot-style info line per seeded group", async () => {
		await seeder.seed(config);

		expect(logger.info).toHaveBeenCalledWith(
			'🏆 Group rank "TCG" · enabled · only-current · members: [* TCG]',
		);
		expect(logger.info).toHaveBeenCalledWith(
			'🏆 Group rank "Rush" · enabled · only-current · members: [* Rush Duel, RD]',
		);
	});

	it("marks a disabled group and omits only-current when it is off", async () => {
		await seeder.seed({
			aliases: {},
			groups: [{ name: "Worlds", enabled: false, onlyCurrent: false, members: ["* Worlds"] }],
		});

		expect(logger.info).toHaveBeenCalledWith(
			'🏆 Group rank "Worlds" · DISABLED · members: [* Worlds]',
		);
	});

	it("logs no group line for a config entry skipped by a type collision", async () => {
		repository.upsertGroup.mockImplementation(async (group) =>
			group.name === "TCG" ? null : { id: `id-${group.name}` },
		);

		await seeder.seed(config);

		expect(logger.info).not.toHaveBeenCalledWith(expect.stringContaining('"TCG"'));
	});

	it("logs the configured aliases in one boot-style line", async () => {
		await seeder.seed({
			aliases: { JTP: "JTP (Original)", "2011.09 Tengu Plant": "2011.09 Tengu" },
			groups: config.groups,
		});

		expect(logger.info).toHaveBeenCalledWith(
			"🏷️  Rank aliases: JTP → JTP (Original) · 2011.09 Tengu Plant → 2011.09 Tengu",
		);
	});

	it("logs no alias line when the config has no aliases", async () => {
		await seeder.seed(config);

		expect(logger.info).not.toHaveBeenCalledWith(expect.stringContaining("Rank aliases"));
	});

	it("does nothing but the orphan check for an empty config", async () => {
		await seeder.seed({ aliases: {}, groups: [] });

		expect(repository.upsertGroup).not.toHaveBeenCalled();
		expect(repository.replaceMembers).not.toHaveBeenCalled();
	});
});
