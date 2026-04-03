export class TimerState {
	public leftMs: [number, number] = [0, 0];
	public compensatorMs: [number, number] = [0, 0];
	public backedMs: [number, number] = [0, 0];
	public runningPos?: number;
	public startedAtMs = 0;
	public awaitingConfirm = false;
	private timer?: ReturnType<typeof setTimeout>;

	reset(initialMs: number): void {
		this.leftMs = [initialMs, initialMs];
		this.compensatorMs = [initialMs, initialMs];
		this.backedMs = [initialMs, initialMs];
		this.clear();
	}

	clear(settleElapsed = false): void {
		if (this.timer) {
			clearTimeout(this.timer);
			this.timer = undefined;
		}
		if (settleElapsed && this.runningPos != null) {
			const elapsedMs = this.elapsedMs();
			if (elapsedMs > 0) {
				this.leftMs[this.runningPos] = Math.max(
					0,
					this.leftMs[this.runningPos] - elapsedMs,
				);
			}
		}
		this.runningPos = undefined;
		this.startedAtMs = 0;
		this.awaitingConfirm = false;
	}

	elapsedMs(): number {
		if (!this.startedAtMs) {
			return 0;
		}
		return Math.max(0, Date.now() - this.startedAtMs);
	}

	schedule(
		player: number,
		delayMs: number,
		awaitingConfirm: boolean,
		onTimeout: () => void,
	): void {
		this.runningPos = player;
		this.startedAtMs = Date.now();
		this.awaitingConfirm = awaitingConfirm;
		this.timer = setTimeout(onTimeout, delayMs);
	}
}
