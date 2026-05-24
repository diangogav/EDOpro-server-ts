import { WindbotNotFoundError, WindbotsExhaustedError } from "./WindbotErrors";

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
