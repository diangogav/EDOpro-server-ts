import { config } from "src/config";
import { WindbotModule } from "../../../windbot/application/WindbotModule";
import { JoinStrategy } from "./JoinStrategy";
import { AIJoinTokenStrategy } from "./AIJoinTokenStrategy";
import { WindBotJoinStrategy } from "./WindBotJoinStrategy";
import { WatchJoinStrategy } from "./WatchJoinStrategy";
import { InviteJoinStrategy } from "./InviteJoinStrategy";
import { TicketJoinStrategy } from "./TicketJoinStrategy";
import { DefaultJoinStrategy } from "./DefaultJoinStrategy";
import { ReservedDuelJoinStrategy } from "./ReservedDuelJoinStrategy";
import { EdoproRoomJoinStrategy } from "./EdoproRoomJoinStrategy";
import { SpeedDuelJoinStrategy } from "./SpeedDuelJoinStrategy";
import { ChallengeJoinStrategy, ChallengeRooms } from "./ChallengeJoinStrategy";
import { ForeignRoomEntry } from "@shared/room/application/ForeignRoomEntry";
import { ForeignSpeedDuelRooms } from "@shared/room/application/ForeignSpeedDuelRooms";

/** What the EDOPro flow offers the clients of this one, when it is wired. */
export interface EdoproFlowRooms {
	/** Entry into a room an EDOPro client hosts ("edo,<id>"). */
	rooms: ForeignRoomEntry;
	/** Speed Duel rooms the EDOPro flow opens on request ("speed"). */
	speedDuelRooms: ForeignSpeedDuelRooms;
}

// Join-routing policy: this context owns the strategy priority order; the
// composition root only decides whether windbot is available.
//
// WatchJoinStrategy must precede TicketJoinStrategy: the ticket strategy
// matches on socket auth alone, not command shape, so a ticketed socket
// sending "w,<id>" would otherwise reach findOrCreateRoom and mint a junk
// room literally named "w,<id>" instead of watching room <id>. For the same
// reason ReservedDuelJoinStrategy ("rv#<id>") precedes it too; it sits in the
// base chain so reserved duels exist whether or not windbot is enabled (a
// reservation naming a bot then ends as bot_unavailable).
//
// EdoproRoomJoinStrategy ("edo,<id>") precedes TicketJoinStrategy for the same
// reason as the watch join, and is absent when the EDOPro flow is not wired.
//
// SpeedDuelJoinStrategy (any command with the "speed" token) heads the whole
// chain, ahead of the windbot strategies too, and is always present: a Speed
// Duel is played in an EDOPro room, so no later strategy may open a YGOPro
// room from that command. Without the EDOPro flow it refuses the join.
//
// ChallengeJoinStrategy ("ch#<code>") heads the chain and is always present:
// it rewrites the join to the room stored for the code and hands it to the
// rest of the chain, so "ch" itself never reaches a strategy that would open
// a room named after it. Without challenge rooms it refuses the join.
export function composeJoinStrategies(
	windbot?: WindbotModule,
	edopro?: EdoproFlowRooms,
	challenges?: ChallengeRooms,
): JoinStrategy[] {
	const rest = composeRoomStrategies(windbot, edopro);

	return [new ChallengeJoinStrategy(challenges, rest), ...rest];
}

function composeRoomStrategies(windbot?: WindbotModule, edopro?: EdoproFlowRooms): JoinStrategy[] {
	const bridgeClients = new Set(config.edoproBridge.clients);
	const speedDuel = new SpeedDuelJoinStrategy(edopro?.speedDuelRooms, bridgeClients);
	const baseChain = [
		new ReservedDuelJoinStrategy(windbot),
		new InviteJoinStrategy(),
		new WatchJoinStrategy(),
		...(edopro ? [new EdoproRoomJoinStrategy(edopro.rooms, bridgeClients)] : []),
		new TicketJoinStrategy(),
		new DefaultJoinStrategy(),
	];

	if (!windbot) {
		return [speedDuel, ...baseChain];
	}

	return [
		speedDuel,
		new AIJoinTokenStrategy(windbot),
		new WindBotJoinStrategy(windbot),
		...baseChain,
	];
}
