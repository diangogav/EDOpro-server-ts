import { IncomingMessage } from "http";

import { HandshakeTicketStore } from "../shared/ticket/domain/TicketRepository";

export type HandshakeAuthResult =
	| { status: "anonymous" }
	| { status: "authenticated"; userId: string }
	| { status: "rejected" }
	// The ticket store could not answer: the ticket's validity is unknown, so the
	// socket proceeds anonymous instead of being rejected.
	| { status: "unavailable" };

export class HandshakeTicketAuthenticator {
	constructor(private readonly tickets: HandshakeTicketStore) {}

	async authenticate(request: IncomingMessage): Promise<HandshakeAuthResult> {
		const token = this.extractToken(request);
		if (token === undefined) return { status: "anonymous" };
		const result = await this.tickets.consumeWithStatus(token);
		switch (result.status) {
			case "consumed":
				return { status: "authenticated", userId: result.userId };
			case "invalid":
				return { status: "rejected" };
			case "unavailable":
				return { status: "unavailable" };
		}
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
