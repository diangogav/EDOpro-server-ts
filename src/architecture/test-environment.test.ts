import * as dotenv from "dotenv";

describe("test environment", () => {
	it("never loads the local .env file", () => {
		// src/test-support/jest.setup.ts stubs dotenv; a real config() would parse the .env file.
		expect(dotenv.config()).toEqual({ parsed: {} });
	});
});
