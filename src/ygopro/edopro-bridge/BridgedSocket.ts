import { ChatColor } from "ygopro-msg-encode";

import { createSystemChat } from "@shared/room/domain/chat/SystemChat";
import { ISocket } from "@shared/socket/domain/ISocket";

import { EdoproWireTranslator } from "./EdoproWireTranslator";
import { ownBanListHash } from "./ownBanListHash";

const LENGTH_PREFIX_BYTES = 2;

/** The frames (`[length:u16][command][body]`) packed in one buffer. */
export function splitFrames(buffer: Buffer): Buffer[] {
	const frames: Buffer[] = [];
	let offset = 0;
	while (offset + LENGTH_PREFIX_BYTES <= buffer.length) {
		const end = offset + LENGTH_PREFIX_BYTES + buffer.readUInt16LE(offset);
		if (end > buffer.length) {
			break;
		}
		frames.push(buffer.subarray(offset, end));
		offset = end;
	}

	return frames;
}

/**
 * The socket an EDOPro room is handed for a client on the YGOPro server. It
 * is the same connection: every property reads and writes through to it, so
 * the room, the room finder and the disconnect handler see one socket. Only
 * the bytes differ, translated in both directions.
 *
 * A core message with no translation is dropped and reported to the player
 * once per kind, because the duel may stop on it.
 *
 * `duelRule` is for a socket that rejoins a duel in progress: the room does
 * not send its host info again, which is where the Master Rule is read from.
 */
export function bridgeToEdoproRoom(socket: ISocket, duelRule?: number): ISocket {
	const reported = new Set<number>();
	const translator = new EdoproWireTranslator(
		(messageType) => {
			if (reported.has(messageType)) {
				return;
			}
			reported.add(messageType);
			socket.send(
				createSystemChat(
					ChatColor.RED,
					`This room sent a move this client cannot show yet (message ${messageType}). The duel may stop here.`,
				),
			);
		},
		duelRule,
		ownBanListHash,
	);

	const send = (buffer: Buffer): void => {
		for (const frame of splitFrames(buffer)) {
			for (const translated of translator.toClientFrames(frame)) {
				socket.send(translated);
			}
		}
	};
	const onMessage = (callback: (message: Buffer) => void): void => {
		socket.onMessage((buffer) => {
			callback(Buffer.concat(splitFrames(buffer).map((frame) => translator.toRoom(frame))));
		});
	};

	return new Proxy(socket, {
		get(target, property) {
			if (property === "send") {
				return send;
			}
			if (property === "onMessage") {
				return onMessage;
			}
			const value = Reflect.get(target, property, target);

			return typeof value === "function" ? value.bind(target) : value;
		},
		set(target, property, value) {
			return Reflect.set(target, property, value, target);
		},
	});
}
