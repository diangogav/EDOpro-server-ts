export class Timer {
	private startTime: number;
	private endTime: number;
	private readonly duration: number;
	private remainingTime: number;
	private timerId: NodeJS.Timeout | null;
	private readonly callback: () => void;

	constructor(duration: number, callback: () => void) {
		this.startTime = 0;
		this.endTime = 0;
		this.duration = duration;
		this.remainingTime = duration;
		this.timerId = null;
		this.callback = callback;
	}

	start(): void {
		if (this.timerId === null) {
			this.startTime = Date.now();
			this.endTime = this.startTime + this.remainingTime;
			this.timerId = setInterval(() => {
				const currentTime = Date.now();
				if (currentTime >= this.endTime) {
					this.stop();
					this.callback();
				} else {
					this.remainingTime = this.endTime - currentTime;
				}
			}, 1000);
		}
	}

	stop(): void {
		if (this.timerId !== null) {
			clearInterval(this.timerId);
			this.timerId = null;
		}
	}

	reset(newDuration?: number): void {
		this.stop();
		this.startTime = 0;
		this.endTime = 0;
		this.remainingTime = newDuration !== undefined ? newDuration : this.duration;
		this.start();
	}

	get time(): number {
		if (Math.ceil(this.remainingTime / 1000) === 0) {
			return 0;
		}

		return Math.ceil(this.remainingTime / 1000);
	}
}
