import { EventEmitter } from "stream";
import { ChatColor } from "ygopro-msg-encode";

import { config } from "../../../config";
import { BufferToUTF16 } from "../../../utils/BufferToUTF16";
import { YgoClient } from "../../client/domain/YgoClient";
import { Commands } from "../../messages/Commands";
import { ClientMessage } from "../../messages/MessageProcessor";
import { Team } from "../Team";
import { createSystemChat } from "./chat/SystemChat";
import { DuelEventDispatcher } from "./duel-events/DuelEventDispatcher";
import { DuelEventPluginHub } from "./duel-events/DuelEventPluginHub";
import { MatchContext } from "./lifecycle/MatchLifecycleHook";
import { createRoomAnnounce } from "./lifecycle/RoomAnnounce";
import { createRoomNotify } from "./lifecycle/RoomNotify";
import { MatchLifecycle, RoomListBroadcaster, RoomStatePorts } from "./RoomStatePorts";
import { YgoRoom } from "./YgoRoom";

/**
 * Base of every room state in both engines. It owns what the engines share:
 * the duel event dispatcher plugins observe, the match start hooks, and the
 * `:score` chat command. Each engine's base state relays chat and emotes in its
 * own wire format (EdoproRoomState, YGOProRoomState).
 */
export abstract class RoomState {
	private static ports: RoomStatePorts | null = null;

	protected readonly eventEmitter: EventEmitter;
	protected readonly duelEvents = new DuelEventDispatcher();

	constructor(eventEmitter: EventEmitter) {
		this.eventEmitter = eventEmitter;
		this.registerDuelEventSubscribers();
		// Plugin subscribers observe the same dispatched events through the
		// hub's bounded per-room queue; with no plugins registered this is a
		// no-op.
		DuelEventPluginHub.getInstance().attach(this.duelEvents);

		this.eventEmitter.on(
			Commands.CHAT as unknown as string,
			(message: ClientMessage, room: YgoRoom, client: YgoClient) =>
				this.handleChat(message, room, client),
		);

		this.eventEmitter.on(
			Commands.EMOTE as unknown as string,
			(message: ClientMessage, room: YgoRoom, client: YgoClient) =>
				this.relayEmote(message, room, client),
		);
	}

	/** Registers the shared collaborators; boot calls it before any room exists. */
	static usePorts(ports: RoomStatePorts): void {
		RoomState.ports = ports;
	}

	removeAllListener(): void {
		this.eventEmitter.removeAllListeners();
	}

	protected get matchLifecycle(): MatchLifecycle {
		return RoomState.registeredPorts().lifecycle;
	}

	protected get roomListBroadcaster(): RoomListBroadcaster {
		return RoomState.registeredPorts().roomList;
	}

	private static registeredPorts(): RoomStatePorts {
		if (!RoomState.ports) {
			throw new Error("RoomState ports are not registered: call registerRoomStatePorts() at boot");
		}

		return RoomState.ports;
	}

	/** Sends a chat line to the room in this engine's wire format. */
	protected abstract relayChat(message: ClientMessage, room: YgoRoom, client: YgoClient): void;

	protected relayEmote(_message: ClientMessage, _room: YgoRoom, _client: YgoClient): void {
		// Engines without emote support ignore the custom CTOS emote frame.
	}

	protected registerDuelEventSubscribers(): void {
		// No internal duel event subscribers by default; plugins still observe
		// the dispatcher through the hub.
	}

	protected broadcastDuelRoomUpdate(room: YgoRoom): void {
		this.roomListBroadcaster.broadcast({
			action: "UPDATE-ROOM",
			data: room.toRealTimePresentation(),
		});
	}

	protected notifyDuelStart(room: YgoRoom): void {
		if (room.isFirstDuel()) {
			this.roomListBroadcaster.broadcast({
				action: "ADD-ROOM",
				data: room.toRealTimePresentation(),
			});
			this.matchLifecycle.runStarted(this.buildStartContext(room));
		} else {
			this.broadcastDuelRoomUpdate(room);
		}
	}

	/**
	 * Runs the match start hooks as soon as the match exists (STOC_DUEL_START),
	 * before rock-paper-scissors, so clients can show the start announcement
	 * (ratings) on their opening VS. notifyDuelStart runs them again when the
	 * engine starts; hooks treat a repeat call for the same matchId as a no-op.
	 */
	protected notifyMatchStarting(room: YgoRoom): void {
		this.matchLifecycle.runStarted(this.buildStartContext(room));
	}

	private buildStartContext(room: YgoRoom): MatchContext {
		return {
			roomId: room.id,
			matchId: room.matchId,
			ranked: room.ranked,
			banListName: this.roomBanListName(room),
			season: config.season,
			players: room.players.map((client) => ({
				id: client.id,
				team: client.team as Team,
				name: client.name,
				winner: false,
			})),
			announce: createRoomAnnounce(room),
			notify: createRoomNotify(room),
		};
	}

	// YgoRoom (the abstract base notifyDuelStart is declared against, shared by
	// both pipelines) does not expose banListName — only the concrete Room and
	// YGOProRoom subclasses do, with the identical `string | null` shape.
	private roomBanListName(room: YgoRoom): string {
		const withBanListName = room as unknown as { banListName?: string | null };

		return withBanListName.banListName ?? "N/A";
	}

	private handleChat(message: ClientMessage, room: YgoRoom, client: YgoClient): void {
		const sanitized = BufferToUTF16(message.data, message.data.length);
		if (sanitized === ":score") {
			client.socket.send(createSystemChat(ChatColor.WHITE, room.score));

			return;
		}

		this.relayChat(message, room, client);
	}
}
