import BetterLock from "better-lock";
import { DataSource } from "typeorm";

import { Logger } from "@shared/logger/domain/Logger";
import LoggerFactory from "@shared/logger/infrastructure/LoggerFactory";

export interface CardDbReloaderPorts {
	// Stable fingerprint of the source .cdb files (changes when their contents do).
	fingerprint(): Promise<string>;
	// Build + merge a fresh DataSource into a new file (never touches the live one).
	build(): Promise<DataSource>;
	// Install `next` as the current datasource and return the replaced one.
	swap(next: DataSource): DataSource;
	// Dispose the replaced datasource (after in-flight queries drained).
	destroy(previous: DataSource): Promise<void>;
}

// Mirrors the YGOPro reload pattern for the EDOPro card DB: on a content change,
// rebuild a fresh datasource and atomically swap it in. A BetterLock serializes
// overlapping checks so two timers can never rebuild at once.
export class CardDbReloader {
	private readonly logger: Logger = LoggerFactory.getLogger();
	private readonly lock = new BetterLock();
	private currentFingerprint: string | null = null;

	constructor(private readonly ports: CardDbReloaderPorts) {}

	// Record the current fingerprint without rebuilding — call once after the boot build.
	async prime(): Promise<void> {
		this.currentFingerprint = await this.ports.fingerprint();
	}

	async reloadIfChanged(): Promise<boolean> {
		return this.lock.acquire(async () => {
			const nextFingerprint = await this.ports.fingerprint();
			if (nextFingerprint === this.currentFingerprint) {
				return false;
			}

			const dataSource = await this.ports.build();
			const previous = this.ports.swap(dataSource);
			this.currentFingerprint = nextFingerprint;
			await this.ports.destroy(previous);
			this.logger.info("EDOPro card DB changed — swapped to a fresh datasource");

			return true;
		});
	}
}
