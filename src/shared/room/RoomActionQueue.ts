/* eslint-disable no-await-in-loop */
export class RoomActionQueue {
	private readonly queue: Array<() => void | Promise<void>> = [];
	private processing = false;

	enqueue(action: () => void | Promise<void>): void {
		this.queue.push(action);

		// Si no se está procesando, iniciamos el loop
		if (!this.processing) {
			void this.processQueue();
		}
	}

	private async processQueue(): Promise<void> {
		this.processing = true;

		try {
			while (this.queue.length > 0) {
				const action = this.queue.shift();
				if (!action) {
					continue;
				}

				const result = action();

				if (result instanceof Promise) {
					await result;
				}
			}
		} finally {
			this.processing = false;

			if (this.queue.length > 0) {
				void this.processQueue();
			}
		}
	}
}
