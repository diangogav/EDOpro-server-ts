import { IncomingMessage } from "http";

import { TicketRepository } from "../shared/ticket/domain/TicketRepository";

export type HandshakeAuthResult =
  | { status: "anonymous" }
  | { status: "authenticated"; userId: string }
  | { status: "rejected" };

export class HandshakeTicketAuthenticator {
  constructor(private readonly tickets: TicketRepository) {}

  async authenticate(request: IncomingMessage): Promise<HandshakeAuthResult> {
    const token = this.extractBearer(request);
    if (token === undefined) return { status: "anonymous" };
    const userId = await this.tickets.consume(token);
    return userId === null
      ? { status: "rejected" }
      : { status: "authenticated", userId };
  }

  private extractBearer(request: IncomingMessage): string | undefined {
    const raw = request.headers["authorization"];
    const header = typeof raw === "string" ? raw : undefined;
    return header !== undefined && header.startsWith("Bearer ") ? header.slice(7) : undefined;
  }
}
