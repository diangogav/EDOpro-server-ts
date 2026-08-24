import "reflect-metadata";

import { EventBus } from "../event-bus/EventBus";

import { container } from "./index";

describe("dependency-injection container", () => {
	it("resolves EventBus via the useFactory registration with no diod resolution error", () => {
		const bus = container.get(EventBus);

		expect(bus).toBeInstanceOf(EventBus);
	});

	it("resolves EventBus as a singleton", () => {
		expect(container.get(EventBus)).toBe(container.get(EventBus));
	});
});
