const readFileMock = jest.fn();
jest.mock("fs/promises", () => ({
	readFile: (...args: unknown[]) => readFileMock(...args),
}));

import { verifyEdisonCore } from "./edisonCore";

function makeLogger() {
	return {
		info: jest.fn(),
		warn: jest.fn(),
		error: jest.fn(),
		debug: jest.fn(),
		child: jest.fn(),
	};
}

describe("verifyEdisonCore", () => {
	const original = process.env.EDISON_CORE_REQUIRED;

	afterEach(() => {
		readFileMock.mockReset();
		if (original === undefined) {
			delete process.env.EDISON_CORE_REQUIRED;
		} else {
			process.env.EDISON_CORE_REQUIRED = original;
		}
	});

	it("warns and does not throw when the fork binary is missing (default)", async () => {
		delete process.env.EDISON_CORE_REQUIRED;
		readFileMock.mockRejectedValue(new Error("ENOENT"));
		const logger = makeLogger();

		await expect(verifyEdisonCore(logger as never)).resolves.toBeUndefined();
		expect(logger.warn).toHaveBeenCalledTimes(1);
		expect(logger.info).not.toHaveBeenCalled();
	});

	it("throws when the fork binary is missing and EDISON_CORE_REQUIRED=true", async () => {
		process.env.EDISON_CORE_REQUIRED = "true";
		readFileMock.mockRejectedValue(new Error("ENOENT"));

		await expect(verifyEdisonCore(makeLogger() as never)).rejects.toThrow(/not found/);
	});

	it("warns on a sha mismatch by default (never silently trusts a wrong binary)", async () => {
		delete process.env.EDISON_CORE_REQUIRED;
		readFileMock.mockResolvedValue(Buffer.from("not the fork binary"));
		const logger = makeLogger();

		await verifyEdisonCore(logger as never);
		expect(logger.warn).toHaveBeenCalledTimes(1);
		expect(logger.info).not.toHaveBeenCalled();
	});

	it("throws on a sha mismatch when EDISON_CORE_REQUIRED=true", async () => {
		process.env.EDISON_CORE_REQUIRED = "true";
		readFileMock.mockResolvedValue(Buffer.from("not the fork binary"));

		await expect(verifyEdisonCore(makeLogger() as never)).rejects.toThrow(/expected/);
	});
});
