import * as generateUnusedRoomIdModule from "../application/generateUnusedRoomId";

import { UnusedRoomIdGenerator } from "./UnusedRoomIdGenerator";

describe("UnusedRoomIdGenerator", () => {
	afterEach(() => {
		jest.restoreAllMocks();
	});

	it("delegates next() to generateUnusedRoomId and returns its value unchanged", () => {
		jest.spyOn(generateUnusedRoomIdModule, "generateUnusedRoomId").mockReturnValue(4242);

		const generator = new UnusedRoomIdGenerator();

		expect(generator.next()).toBe(4242);
		expect(generateUnusedRoomIdModule.generateUnusedRoomId).toHaveBeenCalledTimes(1);
	});

	it("calls generateUnusedRoomId again on every next() call (no caching)", () => {
		const spy = jest
			.spyOn(generateUnusedRoomIdModule, "generateUnusedRoomId")
			.mockReturnValueOnce(1111)
			.mockReturnValueOnce(2222);

		const generator = new UnusedRoomIdGenerator();

		expect(generator.next()).toBe(1111);
		expect(generator.next()).toBe(2222);
		expect(spy).toHaveBeenCalledTimes(2);
	});
});
