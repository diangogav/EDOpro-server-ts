import { CardDbReloader } from "@shared/db/sqlite/infrastructure/CardDbReloader";
import { Logger } from "@shared/logger/domain/Logger";
import LoggerFactory from "@shared/logger/infrastructure/LoggerFactory";
import { config } from "src/config";

import { EdoProCardDbPorts } from "./EdoProCardDbPorts";
import { EdoProSQLiteTypeORM } from "./EdoProSQLiteTypeORM";

const RELOAD_INTERVAL_MS = 10 * 60 * 1000;

// Reload mechanics (atomic in-place replace) live in EdoProCardDbPorts. Mirrors
// the YGOPro reload timer.
export class EdoProCardDbHotReload {
	private static shared: EdoProCardDbHotReload | null = null;

	private readonly logger: Logger = LoggerFactory.getLogger();
	private readonly reloader: CardDbReloader;

	constructor(directory: string = `${config.resources.dir}/edopro/databases`) {
		this.reloader = new CardDbReloader(
			new EdoProCardDbPorts(new EdoProSQLiteTypeORM([directory]), directory),
		);
	}

	// The running instance, or null before start() runs. Lets the resource-version
	// endpoint reach the card-db fingerprint without threading the instance through DI.
	static getShared(): EdoProCardDbHotReload | null {
		return EdoProCardDbHotReload.shared;
	}

	// The fingerprint of the currently loaded EDOPro card DB, or null before the first prime().
	get fingerprint(): string | null {
		return this.reloader.currentFingerprintValue;
	}

	// Record the boot fingerprint, then poll for changes. The boot datasource is
	// already built/merged by bootstrapPersistence, so we only prime here.
	async start(): Promise<void> {
		EdoProCardDbHotReload.shared = this;
		await this.reloader.prime();
		setInterval(() => {
			this.reloader.reloadIfChanged().catch((error) => {
				this.logger.error("Failed reloading EDOPro card DB");
				this.logger.error(error);
			});
		}, RELOAD_INTERVAL_MS);
	}
}
