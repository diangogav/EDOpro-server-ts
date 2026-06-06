import { IncomingMessage } from "http";
import { mock, MockProxy } from "jest-mock-extended";

import { TicketRepository } from "@shared/ticket/domain/TicketRepository";
import { HandshakeTicketAuthenticator } from "./HandshakeTicketAuthenticator";

const makeRequest = (authHeader?: string | string[]): IncomingMessage =>
  ({
    headers:
      authHeader !== undefined
        ? { authorization: authHeader }
        : {},
  } as unknown as IncomingMessage);

describe("HandshakeTicketAuthenticator", () => {
  let tickets: MockProxy<TicketRepository>;
  let authenticator: HandshakeTicketAuthenticator;

  beforeEach(() => {
    tickets = mock<TicketRepository>();
    authenticator = new HandshakeTicketAuthenticator(tickets);
  });

  it("returns anonymous when Authorization header is absent", async () => {
    const result = await authenticator.authenticate(makeRequest());

    expect(result).toEqual({ status: "anonymous" });
    expect(tickets.consume).not.toHaveBeenCalled();
  });

  it("returns authenticated with userId when Bearer token resolves to a userId", async () => {
    tickets.consume.mockResolvedValue("user-123");

    const result = await authenticator.authenticate(makeRequest("Bearer valid-token"));

    expect(result).toEqual({ status: "authenticated", userId: "user-123" });
    expect(tickets.consume).toHaveBeenCalledWith("valid-token");
  });

  it("returns rejected when Bearer token consume returns null", async () => {
    tickets.consume.mockResolvedValue(null);

    const result = await authenticator.authenticate(makeRequest("Bearer unknown-token"));

    expect(result).toEqual({ status: "rejected" });
  });

  it("returns anonymous when Authorization header is an array (non-string)", async () => {
    const result = await authenticator.authenticate(makeRequest(["Bearer token1", "Bearer token2"]));

    expect(result).toEqual({ status: "anonymous" });
    expect(tickets.consume).not.toHaveBeenCalled();
  });

  it("returns anonymous when Authorization header does not start with 'Bearer '", async () => {
    const result = await authenticator.authenticate(makeRequest("Basic dXNlcjpwYXNz"));

    expect(result).toEqual({ status: "anonymous" });
    expect(tickets.consume).not.toHaveBeenCalled();
  });
});
