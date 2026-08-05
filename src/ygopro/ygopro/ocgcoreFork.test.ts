const readFileMock = jest.fn();
jest.mock("fs/promises", () => ({
	readFile: (...args: unknown[]) => readFileMock(...args),
}));

import { verifyOcgcoreFork } from "./ocgcoreFork";

function makeLogger() {
	return {
		info: jest.fn(),
		warn: jest.fn(),
		error: jest.fn(),
		debug: jest.fn(),
		child: jest.fn(),
	};
}

describe("verifyOcgcoreFork", () => {
	const original = process.env.OCGCORE_FORK_REQUIRED;

	afterEach(() => {
		readFileMock.mockReset();
		if (original === undefined) {
			delete process.env.OCGCORE_FORK_REQUIRED;
		} else {
			process.env.OCGCORE_FORK_REQUIRED = original;
		}
	});

	it("warns and does not throw when the fork binary is missing (default)", async () => {
		delete process.env.OCGCORE_FORK_REQUIRED;
		readFileMock.mockRejectedValue(new Error("ENOENT"));
		const logger = makeLogger();

		await expect(verifyOcgcoreFork(logger as never)).resolves.toBeUndefined();
		expect(logger.warn).toHaveBeenCalledTimes(1);
		expect(logger.info).not.toHaveBeenCalled();
	});

	it("throws when the fork binary is missing and OCGCORE_FORK_REQUIRED=true", async () => {
		process.env.OCGCORE_FORK_REQUIRED = "true";
		readFileMock.mockRejectedValue(new Error("ENOENT"));

		await expect(verifyOcgcoreFork(makeLogger() as never)).rejects.toThrow(/not found/);
	});

	it("warns on a sha mismatch by default (never silently trusts a wrong binary)", async () => {
		delete process.env.OCGCORE_FORK_REQUIRED;
		readFileMock.mockResolvedValue(Buffer.from("not the fork binary"));
		const logger = makeLogger();

		await verifyOcgcoreFork(logger as never);
		expect(logger.warn).toHaveBeenCalledTimes(1);
		expect(logger.info).not.toHaveBeenCalled();
	});

	it("throws on a sha mismatch when OCGCORE_FORK_REQUIRED=true", async () => {
		process.env.OCGCORE_FORK_REQUIRED = "true";
		readFileMock.mockResolvedValue(Buffer.from("not the fork binary"));

		await expect(verifyOcgcoreFork(makeLogger() as never)).rejects.toThrow(/expected/);
	});
});
