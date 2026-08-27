import { WindbotModule } from "../../../windbot/application/WindbotModule";
import { JoinStrategy } from "./JoinStrategy";
import { AIJoinTokenStrategy } from "./AIJoinTokenStrategy";
import { WindBotJoinStrategy } from "./WindBotJoinStrategy";
import { WatchJoinStrategy } from "./WatchJoinStrategy";
import { TicketJoinStrategy } from "./TicketJoinStrategy";
import { DefaultJoinStrategy } from "./DefaultJoinStrategy";

// Join-routing policy: this context owns the strategy priority order; the
// composition root only decides whether windbot is available.
//
// WatchJoinStrategy must precede TicketJoinStrategy: the ticket strategy
// matches on socket auth alone, not command shape, so a ticketed socket
// sending "w,<id>" would otherwise reach findOrCreateRoom and mint a junk
// room literally named "w,<id>" instead of watching room <id>.
export function composeJoinStrategies(windbot?: WindbotModule): JoinStrategy[] {
	const baseChain = [new WatchJoinStrategy(), new TicketJoinStrategy(), new DefaultJoinStrategy()];

	if (!windbot) {
		return baseChain;
	}

	return [new AIJoinTokenStrategy(windbot), new WindBotJoinStrategy(windbot), ...baseChain];
}
