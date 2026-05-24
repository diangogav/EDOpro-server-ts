import { WindbotNotFoundError, WindbotsExhaustedError, WindbotUnreachableError } from "./WindbotErrors";

describe("WindbotNotFoundError", () => {
	it("produces the expected message with the bot name", () => {
		const err = new WindbotNotFoundError("Anna");
		expect(err.message).toBe("Windbot not found: Anna");
	});

	it("sets the error name field to WindbotNotFoundError", () => {
		const err = new WindbotNotFoundError("Gear");
		expect(err.name).toBe("WindbotNotFoundError");
	});

	it("inherits from Error", () => {
		const err = new WindbotNotFoundError("Anna");
		expect(err).toBeInstanceOf(Error);
	});

	it("is an instance of WindbotNotFoundError", () => {
		const err = new WindbotNotFoundError("Anna");
		expect(err).toBeInstanceOf(WindbotNotFoundError);
	});
});

describe("WindbotsExhaustedError", () => {
	it("produces the expected message", () => {
		const err = new WindbotsExhaustedError();
		expect(err.message).toBe("No windbots available (all hidden or list empty)");
	});

	it("sets the error name field to WindbotsExhaustedError", () => {
		const err = new WindbotsExhaustedError();
		expect(err.name).toBe("WindbotsExhaustedError");
	});

	it("inherits from Error", () => {
		const err = new WindbotsExhaustedError();
		expect(err).toBeInstanceOf(Error);
	});

	it("is an instance of WindbotsExhaustedError", () => {
		const err = new WindbotsExhaustedError();
		expect(err).toBeInstanceOf(WindbotsExhaustedError);
	});
});

describe("WindbotUnreachableError", () => {
	it("produces a message including the bot name and attempt count", () => {
		const err = new WindbotUnreachableError("Anna", 10);
		expect(err.message).toContain("Anna");
		expect(err.message).toContain("10");
	});

	it("exposes the attempts count via the attempts field", () => {
		const err = new WindbotUnreachableError("Gear", 7);
		expect(err.attempts).toBe(7);
	});

	it("sets the error name field to WindbotUnreachableError", () => {
		const err = new WindbotUnreachableError("Anna", 10);
		expect(err.name).toBe("WindbotUnreachableError");
	});

	it("inherits from Error", () => {
		const err = new WindbotUnreachableError("Anna", 10);
		expect(err).toBeInstanceOf(Error);
	});

	it("is an instance of WindbotUnreachableError", () => {
		const err = new WindbotUnreachableError("Anna", 10);
		expect(err).toBeInstanceOf(WindbotUnreachableError);
	});
});
