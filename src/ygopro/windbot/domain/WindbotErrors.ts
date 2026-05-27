export class WindbotNotFoundError extends Error {
	constructor(name: string) {
		super(`Windbot not found: ${name}`);
		this.name = "WindbotNotFoundError";
		Object.setPrototypeOf(this, WindbotNotFoundError.prototype);
	}
}

export class WindbotsExhaustedError extends Error {
	constructor() {
		super("No windbots available (all hidden or list empty)");
		this.name = "WindbotsExhaustedError";
		Object.setPrototypeOf(this, WindbotsExhaustedError.prototype);
	}
}

export class WindbotUnreachableError extends Error {
	readonly attempts: number;

	constructor(botName: string, attempts: number) {
		super(`Windbot unreachable after ${attempts} attempts for bot "${botName}"`);
		this.name = "WindbotUnreachableError";
		this.attempts = attempts;
		Object.setPrototypeOf(this, WindbotUnreachableError.prototype);
	}
}
