import { IncomingMessage } from "http";
import { mock, MockProxy } from "jest-mock-extended";

import { HandshakeTicketStore } from "@shared/ticket/domain/TicketRepository";
import { HandshakeTicketAuthenticator } from "./HandshakeTicketAuthenticator";

const makeRequest = (authHeader?: string | string[], url?: string): IncomingMessage =>
	({
		headers: authHeader !== undefined ? { authorization: authHeader } : {},
		url,
	}) as unknown as IncomingMessage;

describe("HandshakeTicketAuthenticator", () => {
	let tickets: MockProxy<HandshakeTicketStore>;
	let authenticator: HandshakeTicketAuthenticator;

	beforeEach(() => {
		tickets = mock<HandshakeTicketStore>();
		authenticator = new HandshakeTicketAuthenticator(tickets);
	});

	it("returns anonymous when Authorization header is absent", async () => {
		const result = await authenticator.authenticate(makeRequest());

		expect(result).toEqual({ status: "anonymous" });
		expect(tickets.consumeWithStatus).not.toHaveBeenCalled();
	});

	it("returns authenticated with userId when Bearer token resolves to a userId", async () => {
		tickets.consumeWithStatus.mockResolvedValue({ status: "consumed", userId: "user-123" });

		const result = await authenticator.authenticate(makeRequest("Bearer valid-token"));

		expect(result).toEqual({ status: "authenticated", userId: "user-123" });
		expect(tickets.consumeWithStatus).toHaveBeenCalledWith("valid-token");
	});

	it("returns rejected when Bearer token consume returns null", async () => {
		tickets.consumeWithStatus.mockResolvedValue({ status: "invalid" });

		const result = await authenticator.authenticate(makeRequest("Bearer unknown-token"));

		expect(result).toEqual({ status: "rejected" });
	});

	it("returns unavailable when the ticket store cannot be reached", async () => {
		tickets.consumeWithStatus.mockResolvedValue({ status: "unavailable" });

		const result = await authenticator.authenticate(makeRequest("Bearer some-token"));

		expect(result).toEqual({ status: "unavailable" });
	});

	it("returns anonymous when Authorization header is an array (non-string)", async () => {
		const result = await authenticator.authenticate(
			makeRequest(["Bearer token1", "Bearer token2"]),
		);

		expect(result).toEqual({ status: "anonymous" });
		expect(tickets.consumeWithStatus).not.toHaveBeenCalled();
	});

	it("returns anonymous when Authorization header does not start with 'Bearer '", async () => {
		const result = await authenticator.authenticate(makeRequest("Basic dXNlcjpwYXNz"));

		expect(result).toEqual({ status: "anonymous" });
		expect(tickets.consumeWithStatus).not.toHaveBeenCalled();
	});

	it("returns authenticated when the ticket is provided via the ?ticket= query param", async () => {
		tickets.consumeWithStatus.mockResolvedValue({ status: "consumed", userId: "user-789" });

		const result = await authenticator.authenticate(makeRequest(undefined, "/?ticket=query-token"));

		expect(result).toEqual({ status: "authenticated", userId: "user-789" });
		expect(tickets.consumeWithStatus).toHaveBeenCalledWith("query-token");
	});

	it("returns rejected when the query-param ticket consume returns null", async () => {
		tickets.consumeWithStatus.mockResolvedValue({ status: "invalid" });

		const result = await authenticator.authenticate(makeRequest(undefined, "/?ticket=unknown"));

		expect(result).toEqual({ status: "rejected" });
	});

	it("prefers the Bearer header over the query param when both are present", async () => {
		tickets.consumeWithStatus.mockResolvedValue({ status: "consumed", userId: "user-123" });

		const result = await authenticator.authenticate(
			makeRequest("Bearer header-token", "/?ticket=query-token"),
		);

		expect(result).toEqual({ status: "authenticated", userId: "user-123" });
		expect(tickets.consumeWithStatus).toHaveBeenCalledWith("header-token");
	});

	it("returns anonymous when neither header nor query ticket is present", async () => {
		const result = await authenticator.authenticate(makeRequest(undefined, "/game"));

		expect(result).toEqual({ status: "anonymous" });
		expect(tickets.consumeWithStatus).not.toHaveBeenCalled();
	});
});
