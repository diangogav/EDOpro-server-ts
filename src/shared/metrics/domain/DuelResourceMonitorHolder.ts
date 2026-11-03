import { DuelResourceMonitor, noopDuelResourceMonitor } from "./DuelResourceMonitor";

/**
 * Process-wide access to the duel resource monitor. Duel states are built deep
 * inside the room flows, so the composition root installs the monitor here
 * once; until then (and when metrics are disabled) it measures nothing.
 */
export class DuelResourceMonitorHolder {
	private static monitor: DuelResourceMonitor = noopDuelResourceMonitor;

	public static get(): DuelResourceMonitor {
		return DuelResourceMonitorHolder.monitor;
	}

	public static set(monitor: DuelResourceMonitor): void {
		DuelResourceMonitorHolder.monitor = monitor;
	}

	public static reset(): void {
		DuelResourceMonitorHolder.monitor = noopDuelResourceMonitor;
	}
}
