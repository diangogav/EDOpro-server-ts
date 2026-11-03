export type DuelEngineFlow = "edopro" | "ygopro";

export type DuelResourceContext = {
	flow: DuelEngineFlow;
	roomId: number;
	matchId: string;
	ranked: boolean;
};

export type ThreadResourceStats = {
	cpuSeconds: number;
	memoryBytes: number;
};

export interface DuelResourceWatch {
	/**
	 * Ends the measurement of one duel. A thread duel passes the stats its
	 * worker reported, or null when the worker could not answer. Calling it
	 * again is a no-op.
	 */
	end(stats?: ThreadResourceStats | null): void;
}

/**
 * Measures what one duel engine costs: the EDOPro core runs as its own
 * process, the YGOPro core as a worker thread inside the server process.
 */
export interface DuelResourceMonitor {
	watchProcess(pid: number | undefined, context: DuelResourceContext): DuelResourceWatch;
	watchThread(context: DuelResourceContext): DuelResourceWatch;
}

const noopWatch: DuelResourceWatch = {
	end: () => undefined,
};

export const noopDuelResourceMonitor: DuelResourceMonitor = {
	watchProcess: () => noopWatch,
	watchThread: () => noopWatch,
};
