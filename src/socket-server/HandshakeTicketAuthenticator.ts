import { IncomingMessage } from "http";

import { TicketRepository } from "../shared/ticket/domain/TicketRepository";

export type HandshakeAuthResult =
  | { status: "anonymous" }
  | { status: "authenticated"; userId: string }
  | { status: "rejected" };

export class HandshakeTicketAuthenticator {
  constructor(private readonly tickets: TicketRepository) {}

  async authenticate(request: IncomingMessage): Promise<HandshakeAuthResult> {
    const token = this.extractToken(request);
    if (token === undefined) return { status: "anonymous" };
    const userId = await this.tickets.consume(token);
    return userId === null
      ? { status: "rejected" }
      : { status: "authenticated", userId };
  }

  private extractToken(request: IncomingMessage): string | undefined {
    // Header first (desktop clients). Browsers can't set custom WS handshake
    // headers, so fall back to the ?ticket= query param. The ticket is
    // single-use + 30s TTL, so leaving it in a URL/log is not a real risk.
    return this.extractBearer(request) ?? this.extractQueryTicket(request);
  }

  private extractBearer(request: IncomingMessage): string | undefined {
    const raw = request.headers["authorization"];
    const header = typeof raw === "string" ? raw : undefined;
    return header !== undefined && header.startsWith("Bearer ") ? header.slice(7) : undefined;
  }

  private extractQueryTicket(request: IncomingMessage): string | undefined {
    if (request.url === undefined) return undefined;
    // request.url is relative (e.g. "/?ticket=abc"); the base is only for parsing.
    const ticket = new URL(request.url, "http://placeholder").searchParams.get("ticket");
    return ticket ?? undefined;
  }
}
