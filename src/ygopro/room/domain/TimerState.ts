export class TimerState {
	// Readiness is client-reported, so its free allowance is bounded both per
	// prompt and per side for the whole duel. Turn recovery never refills it.
	public static readonly MAX_PROMPT_GRACE_MS = 30_000;
	public leftMs: [number, number] = [0, 0];
	public graceMs: [number, number] = [0, 0];
	public backedMs: [number, number] = [0, 0];
	public runningPos?: number;
	public startedAtMs = 0;
	public awaitingConfirm = false;
	private timer?: ReturnType<typeof setTimeout>;

	public reset(initialMs: number): void {
		this.clear();
		this.leftMs = [initialMs, initialMs];
		this.graceMs = [initialMs, initialMs];
		this.backedMs = [initialMs, initialMs];
	}

	public clear(settleElapsed = false): void {
		if (this.timer) {
			clearTimeout(this.timer);
			this.timer = undefined;
		}
		if (settleElapsed && this.runningPos != null) {
			this.settleReadiness();
			this.leftMs[this.runningPos] = Math.max(0, this.leftMs[this.runningPos] - this.elapsedMs());
		}
		this.runningPos = undefined;
		this.startedAtMs = 0;
		this.awaitingConfirm = false;
	}

	public elapsedMs(): number {
		return this.runningPos == null ? 0 : Math.max(0, Date.now() - this.startedAtMs);
	}

	public availableGraceMs(player: number): number {
		return Math.min(TimerState.MAX_PROMPT_GRACE_MS, this.graceMs[player]);
	}

	public chargeableElapsedMs(): number {
		const elapsedMs = this.elapsedMs();
		return this.awaitingConfirm && this.runningPos != null
			? Math.max(0, elapsedMs - this.availableGraceMs(this.runningPos))
			: elapsedMs;
	}

	// A response without TIME_CONFIRM also ends readiness. Consume only the
	// grace actually used, then charge the excess before accepting the response.
	public settleReadiness(): void {
		if (this.runningPos == null || !this.awaitingConfirm) return;
		const elapsedMs = this.elapsedMs();
		const freeMs = Math.min(elapsedMs, this.availableGraceMs(this.runningPos));
		this.graceMs[this.runningPos] -= freeMs;
		this.leftMs[this.runningPos] = Math.max(0, this.leftMs[this.runningPos] - (elapsedMs - freeMs));
		this.startedAtMs = Date.now();
		this.awaitingConfirm = false;
	}

	public schedule(
		player: number,
		bankMs: number,
		awaitingConfirm: boolean,
		onTimeout: () => void,
	): void {
		this.runningPos = player;
		this.startedAtMs = Date.now();
		this.awaitingConfirm = awaitingConfirm;
		const delayMs = Math.max(0, bankMs) + (awaitingConfirm ? this.availableGraceMs(player) : 0);
		// Expire synchronously: a queued response must not rescue an exhausted
		// deadline before a zero-delay timeout gets its turn on the event loop.
		if (delayMs <= 0) {
			onTimeout();
			return;
		}
		this.timer = setTimeout(onTimeout, delayMs);
	}
}
