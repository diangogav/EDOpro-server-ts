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
			// this.displayRemainingTime();
			this.timerId = setInterval(() => {
				const currentTime = Date.now();
				if (currentTime >= this.endTime) {
					this.stop();
					this.callback();
				} else {
					this.remainingTime = this.endTime - currentTime;
					// this.displayRemainingTime();
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
		// this.displayRemainingTime();
		this.start();
	}

	// private displayRemainingTime() {
	// 	const seconds = Math.ceil(this.remainingTime / 1000);
	// 	console.log(`Tiempo restante: ${seconds} segundos`);
	// }
}
