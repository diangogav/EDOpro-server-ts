import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { mock, MockProxy } from "jest-mock-extended";
import { Logger } from "@shared/logger/domain/Logger";

import {
	getActiveRankGroupsConfig,
	loadRankGroupsConfig,
	setActiveRankGroupsConfig,
} from "./RankGroupsConfigLoader";

describe("loadRankGroupsConfig", () => {
	let dir: string;
	let logger: MockProxy<Logger>;

	beforeEach(() => {
		dir = fs.mkdtempSync(path.join(os.tmpdir(), "rank-groups-"));
		logger = mock<Logger>();
	});

	afterEach(() => {
		fs.rmSync(dir, { recursive: true, force: true });
	});

	function writeConfig(content: string): string {
		const file = path.join(dir, "rank-groups.json");
		fs.writeFileSync(file, content);

		return file;
	}

	it("parses a valid config file", () => {
		const file = writeConfig(
			JSON.stringify({
				aliases: { JTP: "JTP (Original)" },
				groups: [{ name: "TCG", enabled: true, onlyCurrent: true, members: ["* TCG"] }],
			}),
		);

		expect(loadRankGroupsConfig(file, logger)).toEqual({
			aliases: { JTP: "JTP (Original)" },
			groups: [{ name: "TCG", enabled: true, onlyCurrent: true, members: ["* TCG"] }],
		});
	});

	it("defaults aliases to an empty map when omitted", () => {
		const file = writeConfig(JSON.stringify({ groups: [] }));

		expect(loadRankGroupsConfig(file, logger)).toEqual({ aliases: {}, groups: [] });
	});

	it("returns the empty config and logs info when the file is missing", () => {
		const config = loadRankGroupsConfig(path.join(dir, "does-not-exist.json"), logger);

		expect(config).toEqual({ aliases: {}, groups: [] });
		expect(logger.info).toHaveBeenCalledWith(expect.stringContaining("does-not-exist.json"));
	});

	it("throws loudly on malformed JSON", () => {
		const file = writeConfig("{ this is not json");

		expect(() => loadRankGroupsConfig(file, logger)).toThrow();
	});

	it("throws loudly on a structurally invalid config", () => {
		const file = writeConfig(JSON.stringify({ groups: "nope" }));

		expect(() => loadRankGroupsConfig(file, logger)).toThrow('"groups" must be an array');
	});

	it("throws loudly on a group missing required fields", () => {
		const file = writeConfig(JSON.stringify({ groups: [{ name: "TCG" }] }));

		expect(() => loadRankGroupsConfig(file, logger)).toThrow("groups[0].enabled");
	});

	it("parses the repository seed file, matching the deployed shape", () => {
		const config = loadRankGroupsConfig("./config/rank-groups.json", logger);

		expect(config.aliases).toEqual({
			"2011.09 Tengu Plant": "2011.09 Tengu",
			"JTP (Original)": "JTP",
		});
		expect(config.groups.map((group) => group.name)).toEqual([
			"TCG",
			"OCG",
			"Rush",
			"Speed",
			"Traditional",
			"Worlds",
			"MD",
			"Edison",
			"HAT",
			"JTP All",
			"GOAT",
			"Tengu",
			"Duel Terminal",
			"Eterno",
			"DAD Return",
			"Rush Prereleases",
			"Evolution",
		]);
	});
});

describe("active rank groups config holder", () => {
	it("defaults to the empty config and returns whatever was set", () => {
		expect(getActiveRankGroupsConfig()).toEqual({ aliases: {}, groups: [] });

		const config = {
			aliases: {},
			groups: [{ name: "TCG", enabled: true, onlyCurrent: true, members: ["* TCG"] }],
		};
		setActiveRankGroupsConfig(config);
		expect(getActiveRankGroupsConfig()).toBe(config);

		setActiveRankGroupsConfig({ aliases: {}, groups: [] });
	});
});
