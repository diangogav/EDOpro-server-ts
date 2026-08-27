import type { Express } from "express";

import { TicketRepository } from "@shared/ticket/domain/TicketRepository";

import {
	EnqueueRateLimitMiddleware,
	RateLimitMiddleware,
} from "../middlewares/RateLimitMiddleware";
import { loadRoutes } from "./index";

const makeLogger = () =>
	({
		child: jest.fn().mockReturnThis(),
		info: jest.fn(),
		warn: jest.fn(),
		error: jest.fn(),
		debug: jest.fn(),
	}) as never;

const makeTickets = (): TicketRepository => ({
	consume: jest.fn().mockResolvedValue(null),
});

type RouteCall = [path: string, ...handlers: unknown[]];

function makeApp(): {
	app: Express;
	calls: { get: RouteCall[]; post: RouteCall[]; delete: RouteCall[] };
} {
	const calls = { get: [] as RouteCall[], post: [] as RouteCall[], delete: [] as RouteCall[] };
	const app = {
		get: (...args: RouteCall) => calls.get.push(args),
		post: (...args: RouteCall) => calls.post.push(args),
		delete: (...args: RouteCall) => calls.delete.push(args),
		use: jest.fn(),
	} as unknown as Express;
	return { app, calls };
}

const findRoute = (routes: RouteCall[], path: string): RouteCall | undefined =>
	routes.find(([routePath]) => routePath === path);

describe("loadRoutes — matchmaking rate limiting", () => {
	/** The limiter only protects the route when it runs BEFORE the handler. */
	const expectLimiterBeforeHandler = (route: RouteCall | undefined, middleware: unknown) => {
		expect(route).toBeDefined();
		const handlers = (route as RouteCall).slice(1);
		expect(handlers.indexOf(middleware)).toBe(0);
		expect(handlers.length).toBeGreaterThan(1);
	};

	it("wires the enqueue-scoped rate limiter before the POST /api/matchmaking/queue handler", () => {
		const { app, calls } = makeApp();

		loadRoutes(app, makeLogger(), makeTickets());

		const route = findRoute(calls.post, "/api/matchmaking/queue");
		expectLimiterBeforeHandler(route, EnqueueRateLimitMiddleware);
		// The enqueue budget must be independent: the shared inspect limiter stays off this route.
		expect(route).not.toContain(RateLimitMiddleware);
	});

	it("keeps the shared inspect limiter before the handler on the sibling matchmaking routes", () => {
		const { app, calls } = makeApp();

		loadRoutes(app, makeLogger(), makeTickets());

		expectLimiterBeforeHandler(
			findRoute(calls.get, "/api/matchmaking/status"),
			RateLimitMiddleware,
		);
		expectLimiterBeforeHandler(
			findRoute(calls.delete, "/api/matchmaking/queue"),
			RateLimitMiddleware,
		);
	});
});
