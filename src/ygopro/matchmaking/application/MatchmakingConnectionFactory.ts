import { EventEmitter } from "stream";

import { ISocket } from "@shared/socket/domain/ISocket";

/**
 * Built once per connection by the socket-server's connection wiring (D25):
 * wires a fresh `Session`/`SocketParticipantChannel` for the socket and
 * subscribes the matchmaking opcodes on the connection's `EventEmitter`.
 */
export type MatchmakingConnectionFactory = (socket: ISocket, eventEmitter: EventEmitter) => void;
