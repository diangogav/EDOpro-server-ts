import fs from "node:fs";

import { Logger } from "@shared/logger/domain/Logger";

import {
	RankGroupAliases,
	RankGroupDefinition,
	RankGroupsConfig,
	emptyRankGroupsConfig,
} from "../domain/RankGroupConfig";

// Boot-time holder: loaded once at bootstrap, read by the writers through
// RankGroupResolver. Defaults to the empty config so nothing resolves when
// bootstrap never loaded a file (e.g. ranking disabled).
let activeRankGroupsConfig: RankGroupsConfig = emptyRankGroupsConfig();

export function setActiveRankGroupsConfig(config: RankGroupsConfig): void {
	activeRankGroupsConfig = config;
}

export function getActiveRankGroupsConfig(): RankGroupsConfig {
	return activeRankGroupsConfig;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseAliases(value: unknown, path: string): RankGroupAliases {
	if (value === undefined) {
		return {};
	}
	if (!isRecord(value)) {
		throw new Error(`Rank groups config ${path}: "aliases" must be an object of strings`);
	}
	for (const [alias, canonical] of Object.entries(value)) {
		if (typeof canonical !== "string" || canonical === "") {
			throw new Error(
				`Rank groups config ${path}: alias "${alias}" must map to a non-empty string`,
			);
		}
	}

	return value as RankGroupAliases;
}

function parseGroup(value: unknown, index: number, path: string): RankGroupDefinition {
	if (!isRecord(value)) {
		throw new Error(`Rank groups config ${path}: groups[${index}] must be an object`);
	}
	const { name, enabled, onlyCurrent, members } = value;
	if (typeof name !== "string" || name === "") {
		throw new Error(`Rank groups config ${path}: groups[${index}].name must be a non-empty string`);
	}
	if (typeof enabled !== "boolean") {
		throw new Error(`Rank groups config ${path}: groups[${index}].enabled must be a boolean`);
	}
	if (typeof onlyCurrent !== "boolean") {
		throw new Error(`Rank groups config ${path}: groups[${index}].onlyCurrent must be a boolean`);
	}
	if (!Array.isArray(members) || members.some((member) => typeof member !== "string")) {
		throw new Error(
			`Rank groups config ${path}: groups[${index}].members must be an array of strings`,
		);
	}

	return { name, enabled, onlyCurrent, members: members as string[] };
}

/**
 * Reads the rank-groups config file. A missing file is a supported setup (no
 * group ranks) and only logs info; anything unreadable, malformed, or
 * structurally invalid throws so a config bug fails boot loudly instead of
 * silently seeding nothing.
 */
export function loadRankGroupsConfig(path: string, logger: Logger): RankGroupsConfig {
	let raw: string;
	try {
		raw = fs.readFileSync(path, "utf8");
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === "ENOENT") {
			logger.info(`Rank groups config not found at ${path} — no group ranks configured`);

			return emptyRankGroupsConfig();
		}
		throw error;
	}

	const parsed: unknown = JSON.parse(raw);
	if (!isRecord(parsed)) {
		throw new Error(`Rank groups config ${path}: root must be an object`);
	}
	const groupsValue = parsed.groups ?? [];
	if (!Array.isArray(groupsValue)) {
		throw new Error(`Rank groups config ${path}: "groups" must be an array`);
	}

	return {
		aliases: parseAliases(parsed.aliases, path),
		groups: groupsValue.map((group, index) => parseGroup(group, index, path)),
	};
}
