import { Logger } from "@shared/logger/domain/Logger";

import { RankGroupDefinition, RankGroupsConfig } from "../domain/RankGroupConfig";
import { RankGroupRepository } from "../domain/RankGroupRepository";

/**
 * Boot-time seeder: upserts every configured group rank (type "group") and
 * replaces its member patterns. Ranks of other types are never touched, and
 * group ranks absent from the config are left in place with a warning — the
 * config drives creation and updates, never deletion.
 */
export class RankGroupSeeder {
	constructor(
		private readonly repository: RankGroupRepository,
		private readonly logger: Logger,
	) {
		this.logger = logger.child({ file: "RankGroupSeeder" });
	}

	async seed(config: RankGroupsConfig): Promise<void> {
		const existingNames = await this.repository.findGroupNames();
		const configuredNames = new Set(config.groups.map((group) => group.name));
		const orphans = existingNames.filter((name) => !configuredNames.has(name));
		if (orphans.length > 0) {
			this.logger.warn(
				`Group ranks in DB but absent from config (left untouched): ${orphans.join(", ")}`,
			);
		}

		for (const group of config.groups) {
			const upserted = await this.repository.upsertGroup({
				name: group.name,
				enabled: group.enabled,
				onlyCurrent: group.onlyCurrent,
			});
			if (upserted === null) {
				this.logger.warn(
					`Rank "${group.name}" already exists with a non-group type — group config entry skipped`,
				);
				continue;
			}

			await this.repository.replaceMembers(upserted.id, group.members);
			this.logger.info(describeGroup(group));
		}

		const aliases = Object.entries(config.aliases);
		if (aliases.length > 0) {
			this.logger.info(
				`🏷️  Rank aliases: ${aliases.map(([from, to]) => `${from} → ${to}`).join(" · ")}`,
			);
		}
	}
}

function describeGroup(group: RankGroupDefinition): string {
	const state = group.enabled ? "enabled" : "DISABLED";
	const onlyCurrent = group.onlyCurrent ? " · only-current" : "";

	return `🏆 Group rank "${group.name}" · ${state}${onlyCurrent} · members: [${group.members.join(", ")}]`;
}
