 
export class RoomActionQueue {
	private readonly queue: Array<() => void | Promise<void>> = [];
	private processing = false;
	private drainResolvers: Array<() => void> = [];

	enqueue(action: () => void | Promise<void>): void {
		this.queue.push(action);

		// Si no se está procesando, iniciamos el loop
		if (!this.processing) {
			void this.processQueue();
		}
	}

	/**
	 * 🟩 Permite esperar a que la cola esté totalmente vacía.
	 */
	async drain(): Promise<void> {
		if (!this.processing && this.queue.length === 0) {
			return Promise.resolve();
		}

		return new Promise((resolve) => {
			this.drainResolvers.push(resolve);
		});
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

			// Resolver todas las promesas de drain()
			this.drainResolvers.forEach((resolve) => {
				resolve();
			});
			this.drainResolvers = [];

			// Si llegaron nuevas acciones durante el procesamiento
			if (this.queue.length > 0) {
				void this.processQueue();
			}
		}
	}
}
