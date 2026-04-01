import EventEmitter from "events";

import { PlayerInfoMessage } from "../../../../edopro/messages/client-to-server/PlayerInfoMessage";
import { Commands } from "../../../../shared/messages/Commands";
import { ClientMessage } from "../../../../shared/messages/MessageProcessor";
import { Logger } from "../../../../shared/logger/domain/Logger";
import { ISocket } from "../../../../shared/socket/domain/ISocket";
import { YGOProClient } from "../../../client/domain/YGOProClient";
import { YGOProRoom } from "../YGOProRoom";
import {
  YGOProCtosHandResult,
} from "ygopro-msg-encode";
import { Team } from "@shared/room/Team";
import { YGOProRoomState } from "../YGOProRoomState";

export class YGOProRockPaperScissorState extends YGOProRoomState {
  private handResult = [0, 0];

  constructor(
    eventEmitter: EventEmitter,
    private readonly logger: Logger,
  ) {
    super(eventEmitter);
    this.logger = logger.child({ file: "YGOProRockPaperScissorState" });
    this.eventEmitter.on(
      Commands.RPS_CHOICE as unknown as string,
      (message: ClientMessage, room: YGOProRoom, client: YGOProClient) =>
        this.handleRPSChoice.bind(this)(message, room, client),
    );
    this.eventEmitter.on(
      "JOIN",
      (message: ClientMessage, room: YGOProRoom, socket: ISocket) =>
        void this.handleJoin.bind(this)(message, room, socket),
    );
  }

  private handleJoin(
    message: ClientMessage,
    room: YGOProRoom,
    socket: ISocket,
  ): void {
    this.logger.info("handleJoin");

    const playerInfoMessage = new PlayerInfoMessage(
      message.previousMessage,
      message.data.length,
    );
    const playerAlreadyInRoom = this.playerAlreadyInRoom(
      playerInfoMessage,
      room,
      socket,
    );

    if (!(playerAlreadyInRoom instanceof YGOProClient)) {
      const spectator = room.createSpectatorUnsafe(
        socket,
        playerInfoMessage.name,
      );
      room.addSpectatorUnsafe(spectator);
      spectator.sendMessageToClient(room.messageSender.duelStartMessage());
      room.sendDeckCountMessage(spectator);
      return;
    }

    room.reconnect(playerAlreadyInRoom, socket);

    playerAlreadyInRoom.sendMessageToClient(room.messageSender.duelStartMessage());

    room.sendDeckCountMessage(playerAlreadyInRoom);

    const hasSelected = this.handResult[playerAlreadyInRoom.team] !== 0;
    if (playerAlreadyInRoom.isCaptain && !hasSelected) {
      playerAlreadyInRoom.sendMessageToClient(room.messageSender.selectHandMessage());
    }
  }

  private handleRPSChoice(
    message: ClientMessage,
    room: YGOProRoom,
    player: YGOProClient,
  ): void {
    player.logger.info(
      `handleRPSChoice: ${message.raw.toString("hex")}`,
    );

    if (!player.isCaptain) {
      return;
    }

    const data = new YGOProCtosHandResult().fromPayload(message.data);

    // if (data.res < HandResult.ROCK || data.res > HandResult.PAPER) {
    // 	return;
    // }

    const team = player.team;
    if (team < Team.PLAYER || team > Team.OPPONENT) {
      return;
    }

    this.handResult[team] = data.res;

    if (!this.handResult[Team.PLAYER] || !this.handResult[Team.OPPONENT]) {
      return;
    }

    const team0Result = room.messageSender.handResultMessage(
      this.handResult[Team.PLAYER],
      this.handResult[Team.OPPONENT],
    );
    room
      .getTeamPlayers(Team.PLAYER)
      .forEach((_player) =>
        _player.sendMessageToClient(team0Result),
      );
    room.spectators.forEach((spectator: YGOProClient) =>
      spectator.sendMessageToClient(team0Result),
    );

    const team1Result = room.messageSender.handResultMessage(
      this.handResult[Team.OPPONENT],
      this.handResult[Team.PLAYER],
    );
    room
      .getTeamPlayers(Team.OPPONENT)
      .forEach((_player) =>
        _player.sendMessageToClient(team1Result),
      );

    if (this.handResult[Team.PLAYER] === this.handResult[Team.OPPONENT]) {
      this.handResult = [0, 0];
      this.toRPS(room);
      return;
    }

    const winner = this.getRPSWinner();
    const winnerPlayer = room.getTeamPlayers(winner)[0];
    if (!winnerPlayer) {
      return;
    }

    this.handResult = [0, 0];
    winnerPlayer.sendMessageToClient(
      room.messageSender.selectTpMessage(),
    );

    room.setClientWhoChoosesTurn(winnerPlayer);
    room.choosingOrder();
  }

  private getRPSWinner(): number {
    if (
      (this.handResult[Team.PLAYER] === 1 && this.handResult[Team.OPPONENT] === 2) ||
      (this.handResult[Team.PLAYER] === 2 && this.handResult[Team.OPPONENT] === 3) ||
      (this.handResult[Team.PLAYER] === 3 && this.handResult[Team.OPPONENT] === 1)
    ) {
      return Team.OPPONENT;
    } else {
      return Team.PLAYER;
    }
  }
}
