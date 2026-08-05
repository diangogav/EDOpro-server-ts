const existsSyncMock = jest.fn();
jest.mock("fs", () => ({
	existsSync: (...args: unknown[]) => existsSyncMock(...args),
}));

import { ocgcoreForkPath, resolveForkCorePath } from "./ocgcoreFork";

function makeLogger() {
	return {
		info: jest.fn(),
		warn: jest.fn(),
		error: jest.fn(),
		debug: jest.fn(),
		child: jest.fn(),
	};
}

describe("resolveForkCorePath", () => {
	afterEach(() => existsSyncMock.mockReset());

	it("returns the fork path and logs it as active when the binary is present", () => {
		existsSyncMock.mockReturnValue(true);
		const logger = makeLogger();

		expect(resolveForkCorePath(logger as never)).toBe(ocgcoreForkPath());
		expect(logger.info).toHaveBeenCalledTimes(1);
		expect(logger.warn).not.toHaveBeenCalled();
	});

	it("returns undefined and warns loudly when the fork binary is missing", () => {
		existsSyncMock.mockReturnValue(false);
		const logger = makeLogger();

		expect(resolveForkCorePath(logger as never)).toBeUndefined();
		expect(logger.warn).toHaveBeenCalledTimes(1);
		expect(logger.info).not.toHaveBeenCalled();
	});
});
