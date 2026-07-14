import { DataSource } from "typeorm";

import { CardDbReloader, CardDbReloaderPorts } from "./CardDbReloader";

class FakePorts implements CardDbReloaderPorts {
	fp = "a";
	builds = 0;
	swapped: DataSource[] = [];
	destroyed: DataSource[] = [];
	readonly builtDs = { tag: "new" } as unknown as DataSource;
	readonly oldDs = { tag: "old" } as unknown as DataSource;

	async fingerprint(): Promise<string> {
		return this.fp;
	}

	async build(): Promise<DataSource> {
		this.builds++;

		return this.builtDs;
	}

	swap(next: DataSource): DataSource {
		this.swapped.push(next);

		return this.oldDs;
	}

	async destroy(previous: DataSource): Promise<void> {
		this.destroyed.push(previous);
	}
}

describe("CardDbReloader", () => {
	it("does not rebuild when the fingerprint is unchanged after priming", async () => {
		const ports = new FakePorts();
		const reloader = new CardDbReloader(ports);
		await reloader.prime();

		expect(await reloader.reloadIfChanged()).toBe(false);
		expect(ports.builds).toBe(0);
		expect(ports.swapped).toHaveLength(0);
	});

	it("rebuilds, swaps, and destroys the old datasource when the fingerprint changes", async () => {
		const ports = new FakePorts();
		const reloader = new CardDbReloader(ports);
		await reloader.prime();
		ports.fp = "b";

		expect(await reloader.reloadIfChanged()).toBe(true);
		expect(ports.builds).toBe(1);
		expect(ports.swapped).toEqual([ports.builtDs]);
		expect(ports.destroyed).toEqual([ports.oldDs]);
	});

	it("no-ops on the next check once the new fingerprint is recorded", async () => {
		const ports = new FakePorts();
		const reloader = new CardDbReloader(ports);
		await reloader.prime();
		ports.fp = "b";
		await reloader.reloadIfChanged();

		expect(await reloader.reloadIfChanged()).toBe(false);
		expect(ports.builds).toBe(1);
	});

	it("exposes null as the current fingerprint before priming", () => {
		const reloader = new CardDbReloader(new FakePorts());

		expect(reloader.currentFingerprintValue).toBeNull();
	});

	it("exposes the primed fingerprint, and updates it after a reload", async () => {
		const ports = new FakePorts();
		const reloader = new CardDbReloader(ports);
		await reloader.prime();

		expect(reloader.currentFingerprintValue).toBe("a");

		ports.fp = "b";
		await reloader.reloadIfChanged();

		expect(reloader.currentFingerprintValue).toBe("b");
	});
});
