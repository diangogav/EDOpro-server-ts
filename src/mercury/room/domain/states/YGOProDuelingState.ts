import { EventEmitter } from "events";

import { PlayerInfoMessage } from "@edopro/messages/client-to-server/PlayerInfoMessage";
import { RoomState } from "@edopro/room/domain/RoomState";

import { OCGCore } from "@ygopro/ocgcore-worker/ocgcore";

import { container } from "@shared/dependency-injection";
import { EventBus } from "@shared/event-bus/EventBus";
import { Commands } from "@shared/messages/Commands";
import { ClientMessage } from "@shared/messages/MessageProcessor";
import { Logger } from "@shared/logger/domain/Logger";
import { ISocket } from "@shared/socket/domain/ISocket";
import { Team } from "@shared/room/Team";

import { MercuryClient } from "../../../client/domain/MercuryClient";
import { DuelRecord } from "../DuelRecord";
import { YGOProRoom } from "../YGOProRoom";
import { getMessageIdentifier } from "../../../utils/response-time-utils";

import {
  OcgcoreScriptConstants,
  YGOProCtosUpdateDeck,
  YGOProMsgStart,
  YGOProMsgWin,
  YGOProStocChat,
  YGOProStocDuelEnd,
  YGOProStocDuelStart,
  YGOProStocGameMsg,
  YGOProStocReplay,
} from "ygopro-msg-encode";
import { GameOverDomainEvent } from "@shared/room/domain/match/domain/domain-events/GameOverDomainEvent";
import MercuryRoomList from "@ygopro/room/infrastructure/MercuryRoomList";
import WebSocketSingleton from "src/web-socket-server/WebSocketSingleton";

export class YGOProDuelingState extends RoomState {
  private readonly eventBus: EventBus;
  private readonly ocgCore: OCGCore;

  constructor(
    private readonly room: YGOProRoom,
    eventEmitter: EventEmitter,
    private readonly logger: Logger,
  ) {
    super(eventEmitter);
    this.logger = logger.child({ file: "MercuryDuelingState" });
    this.ocgCore = new OCGCore(this.room, this.logger);
    this.handle();
    this.eventBus = container.get(EventBus);

    this.eventEmitter.on(
      "JOIN",
      (message: ClientMessage, room: YGOProRoom, socket: ISocket) =>
        void this.handleJoin.bind(this)(message, room, socket),
    );

    this.eventEmitter.on(
      Commands.UPDATE_DECK as unknown as string,
      (message: ClientMessage, room: YGOProRoom, socket: ISocket) =>
        void this.handleUpdateDeck.bind(this)(message, room, socket),
    );

    this.eventEmitter.on(
      Commands.RESPONSE as unknown as string,
      (message: ClientMessage, room: YGOProRoom, client: MercuryClient) =>
        void this.handleResponse.bind(this)(message, room, client),
    );

    this.eventEmitter.on(
      Commands.TIME_CONFIRM as unknown as string,
      (message: ClientMessage, room: YGOProRoom, client: MercuryClient) =>
        void this.handleTimeConfirm.bind(this)(message, room, client),
    );
  }

  private async handle(): Promise<void> {
    this.logger.info("handle");

    const duelRecord = await this.ocgCore.init();
    this.room.addDuelRecord(duelRecord);
    this.ocgCore.resetResponseRequestState();

    this.ocgCore.messageMiddleware.on(
      YGOProMsgWin,
      (msg) => {
        this.logger.info(`Winner: player=${msg.player}, type=${msg.type}`);
        this.handleWinCondition(msg);
        return msg;
      },
      100,
    );

    const [
      player0DeckCount,
      player0ExtraCount,
      player1DeckCount,
      player1ExtraCount,
    ] = await Promise.all([
      this.ocgCore.queryFieldCount({
        team: Team.PLAYER,
        location: OcgcoreScriptConstants.LOCATION_DECK,
      }),
      this.ocgCore.queryFieldCount({
        team: Team.PLAYER,
        location: OcgcoreScriptConstants.LOCATION_EXTRA,
      }),
      this.ocgCore.queryFieldCount({
        team: Team.OPPONENT,
        location: OcgcoreScriptConstants.LOCATION_DECK,
      }),
      this.ocgCore.queryFieldCount({
        team: Team.OPPONENT,
        location: OcgcoreScriptConstants.LOCATION_EXTRA,
      }),
    ]);

    const createStartMsg = (playerType: number) =>
      new YGOProStocGameMsg().fromPartial({
        msg: new YGOProMsgStart().fromPartial({
          playerType,
          duelRule: this.room.hostInfo.duel_rule,
          startLp0: this.room.hostInfo.start_lp,
          startLp1: this.room.hostInfo.start_lp,
          player0: {
            deckCount: player0DeckCount,
            extraCount: player0ExtraCount,
          },
          player1: {
            deckCount: player1DeckCount,
            extraCount: player1ExtraCount,
          },
        }),
      });

    const side0Players = this.ocgCore.getPlayersAtIngamePosition(0);
    const side1Players = this.ocgCore.getPlayersAtIngamePosition(1);

    side0Players.forEach((p) =>
      p.sendMessageToClient(Buffer.from(createStartMsg(0).toFullPayload())),
    );
    side1Players.forEach((p) =>
      p.sendMessageToClient(Buffer.from(createStartMsg(1).toFullPayload())),
    );

    const watcherType = this.room.isPositionSwapped ? 0x11 : 0x10;
    const watcherStartMessage = createStartMsg(watcherType);
    const spectators = this.room.spectators as MercuryClient[];
    spectators.forEach((spectator) => {
      spectator.sendMessageToClient(
        Buffer.from(watcherStartMessage.toFullPayload()),
      );
    });

    this.room.saveMessageToDuelRecord(watcherStartMessage.msg!);

    this.ocgCore.refreshZones({
      player: Team.PLAYER,
      location: OcgcoreScriptConstants.LOCATION_EXTRA,
    });
    this.ocgCore.refreshZones({
      player: Team.OPPONENT,
      location: OcgcoreScriptConstants.LOCATION_EXTRA,
    });

    this.ocgCore.advance();
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

    if (!(playerAlreadyInRoom instanceof MercuryClient)) {
      const spectator = room.createSpectatorUnsafe(
        socket,
        playerInfoMessage.name,
      );
      room.addSpectatorUnsafe(spectator);
      spectator.sendMessageToClient(
        Buffer.from(new YGOProStocDuelStart().toFullPayload()),
      );
      room.sendPreviousDuelsHistoricalMessages(spectator);
      room.sendCurrentDuelHistoricalMessages(spectator);
      return;
    }

    this.room.reconnect(playerAlreadyInRoom, socket);
  }

  private async handleUpdateDeck(
    message: ClientMessage,
    _room: YGOProRoom,
    player: MercuryClient,
  ): Promise<void> {
    player.logger.info("handleUpdateDeck");
    if (!player.isReconnecting || !player.deck) {
      return;
    }

    const updateDeckMessage = new YGOProCtosUpdateDeck().fromPayload(
      message.data,
    );

    if (
      !player.deck.isSideDeckValid(
        updateDeckMessage.deck.main,
        updateDeckMessage.deck.side,
      )
    ) {
      const status = (player.position << 4) | 0x0a;
      player.sendMessageToClient(
        this.room.messageSender.playerChangeMessage(player.position, status),
      );
      return;
    }

    player.sendMessageToClient(
      Buffer.from(new YGOProStocDuelStart().toFullPayload()),
    );
    this.ocgCore.sendStartMessageForReconnect(player);
    this.ocgCore.sendTurnMessages(player);
    this.ocgCore.sendPhaseMessage(player);
    await this.ocgCore.sendRequestFieldMessage(player);
    await this.ocgCore.sendRefreshZonesMessages(player);
    await this.ocgCore.sendDeckReversedAndTopMessages(player);
    await this.ocgCore.sendReconnectTimeLimitAndResponseState(player);
    player.clearReconnecting();
  }

  private async handleResponse(
    message: ClientMessage,
    room: YGOProRoom,
    player: MercuryClient,
  ): Promise<void> {
    player.logger.info("handleResponse");

    if (
      this.ocgCore.currentResponseSide === null ||
      player !== this.ocgCore.responsePlayer ||
      !this.ocgCore.hasOcgcore()
    ) {
      return;
    }

    const responseSide = this.ocgCore.currentResponseSide;
    const responseTeam = this.ocgCore.getSideTeam(responseSide);
    const responseRequestMsg = this.ocgCore.currentLastResponseRequestMsg;
    const responseBuffer = Buffer.from(message.data);

    // Handle time limit compensation
    if (this.ocgCore.timeLimitEnabled) {
      this.ocgCore.clearResponseTimerState(true);
      const msgType = this.ocgCore.isRetryingState
        ? 0x02 // MSG_RETRY
        : responseRequestMsg
          ? getMessageIdentifier(responseRequestMsg)
          : 0;
      this.ocgCore.increaseResponseTime(
        responseTeam,
        msgType,
        responseBuffer,
      );
    }

    // Clear response request state (NOT responsePosition)
    this.ocgCore.clearResponseRequestState();

    // Send response to OCGCore and advance
    try {
      await this.ocgCore.setResponse(responseBuffer);
    } catch (error) {
      player.logger.error("Failed to set response in ocgcore", { error });
      room.setDuelFinished();

      return;
    }

    await this.ocgCore.advance();
  }

  private async handleTimeConfirm(
    _message: ClientMessage,
    _room: YGOProRoom,
    player: MercuryClient,
  ): Promise<void> {
    player.logger.info("handleTimeConfirm");

    // Check if time limit is enabled
    if (!this.ocgCore.timeLimitEnabled) {
      return;
    }

    // Check if there's an active response request
    const responseSide = this.ocgCore.currentResponseSide;
    if (responseSide === null) {
      return;
    }

    const timerState = this.ocgCore.timerStateAccessor;

    // Check if timer is running and waiting for confirm
    if (timerState.runningPos === null || !timerState.awaitingConfirm) {
      return;
    }

    // Check if the player responding is the one who sent TIME_CONFIRM
    if (timerState.runningPos !== this.ocgCore.getSideTeam(responseSide)) {
      return;
    }

    // Verify the player is the one who should respond
    const responsePlayer = this.ocgCore.responsePlayer;
    if (!responsePlayer || player !== responsePlayer) {
      return;
    }

    // Handle TIME_CONFIRM - reschedule timer and send TIME_LIMIT to client
    await this.ocgCore.rescheduleTimerAfterConfirm(responseSide);

    // Continue the duel after confirming time
  }

  private async handleWinCondition(winMsg: YGOProMsgWin): Promise<void> {
    const winner = this.ocgCore.toIngamePosition(winMsg.player);

    this.logger.info(
      `handleWinCondition: player=${winMsg.player}, type=${winMsg.type}, winner=${winner}`,
    );

    if (this.room.isFinished()) {
      return;
    }

    await this.processDuelEnd(winMsg, winner);
    await this.determineNextPhase(winner);
  }

  private async processDuelEnd(
    winMsg: YGOProMsgWin,
    winner: number,
  ): Promise<void> {
    this.room.finished();
    this.room.duelWinner(winner);
    this.room.players.forEach((client) => client.notReady());

    this.broadcastWinMessage(winMsg);
    this.updateDuelRecord(winner, winMsg.type);
  }

  private broadcastWinMessage(winMsg: YGOProMsgWin): void {
    this.room.clients.forEach((client: MercuryClient) => {
      client.sendMessageToClient(
        this.room.messageSender.winMessage(winMsg.player, winMsg.type),
      );
    });
  }

  private updateDuelRecord(winner: number, winType: number): void {
    const duelRecord = this.room.currentDuelRecord;
    if (!duelRecord) return;

    duelRecord.winPosition = winner;
    duelRecord.winReason = winType;
    duelRecord.endTime = new Date();
  }

  private async determineNextPhase(winner: number): Promise<void> {
    const score = this.room.matchScore();

    this.logger.info(
      `Score: team0=${score.team0}, team1=${score.team1}, bestOf=${this.room.bestOf}, isWinMatch=${this.room.isMatchFinished()}`,
    );

    if (this.room.isMatchFinished()) {
      await this.finalizeWithReplays();
      this.dispatchGameOverDomainEvent();
      this.removeRoom();

      return;
    }

    this.transitionToSideDecking(winner);
  }

  private transitionToSideDecking(winner: number): void {
    this.room.sideDecking();

    this.room.players.forEach((client: MercuryClient) => {
      client.sendMessageToClient(this.room.messageSender.changeSideMessage());
    });

    this.room.spectators.forEach((client: MercuryClient) => {
      client.sendMessageToClient(this.room.messageSender.waitingSideMessage());
    });

    this.assignSideDeckChoice(winner);
  }

  private assignSideDeckChoice(winner: number): void {
    const looser = this.room.players.find((client: MercuryClient) => {
      const isLoserTeam =
        winner === Team.PLAYER
          ? client.team === Team.OPPONENT
          : client.team === Team.PLAYER;
      const positionMod =
        winner === Team.PLAYER
          ? client.position % this.room.team1
          : client.position % this.room.team0;
      return positionMod === Team.PLAYER && isLoserTeam;
    });

    if (looser) {
      this.room.setClientWhoChoosesTurn(looser);
    }
  }

  private async finalizeWithReplays(): Promise<void> {
    this.logger.info("Finalizing match and sending replays");

    this.disposeCore();
    await this.sendAllReplays();
    this.sendDuelEndAndDisconnect();
  }

  private disposeCore(): void {
    if (this.ocgCore.hasOcgcore()) {
      this.ocgCore.dispose();
      this.logger.info("OCGCore disposed");
    }
  }

  private async sendAllReplays(): Promise<void> {
    const duelRecords = this.room.duelRecords;

    for (let i = 0; i < duelRecords.length; i++) {
      const replayBuffer = this.generateReplayBuffer(i, duelRecords[i]);
      if (!replayBuffer) continue;

      this.broadcastReplay(i + 1, duelRecords.length, replayBuffer);
    }
  }

  private generateReplayBuffer(
    index: number,
    duelRecord: DuelRecord,
  ): Buffer | null {
    try {
      const replayData = duelRecord.toYrp(this.room);
      const replayMsg = new YGOProStocReplay().fromPartial({
        replay: replayData,
      });
      return Buffer.from(replayMsg.toFullPayload());
    } catch (err) {
      this.logger.error(String(err), { duelIndex: index });
      return null;
    }
  }

  private broadcastReplay(
    index: number,
    total: number,
    replayBuffer: Buffer,
  ): void {
    const hintMsg = new YGOProStocChat().fromPartial({
      player_type: 0,
      msg: `#replay_hint_part1${index}#replay_hint_part2`,
    });
    const hintBuffer = Buffer.from(hintMsg.toFullPayload());

    this.room.clients.forEach((client: MercuryClient) => {
      client.sendMessageToClient(hintBuffer);
      client.sendMessageToClient(replayBuffer);
    });

    this.logger.info(
      `Sent replay ${index}/${total} (${replayBuffer.length} bytes)`,
    );
  }

  private sendDuelEndAndDisconnect(): void {
    const duelEndBuffer = Buffer.from(new YGOProStocDuelEnd().toFullPayload());

    this.room.clients.forEach((client: MercuryClient) => {
      client.sendMessageToClient(duelEndBuffer);
      client.destroy();
    });

    this.logger.info("Duel end sent and all clients disconnected");
  }

  private dispatchGameOverDomainEvent(): void {
    this.eventBus.publish(
      GameOverDomainEvent.DOMAIN_EVENT,
      new GameOverDomainEvent({
        bestOf: this.room.bestOf,
        players: this.room.matchPlayersHistory,
        date: new Date(),
        banListHash: this.room.banListHash,
        ranked: this.room.ranked,
      }),
    );
  }

  private removeRoom(): void {
    WebSocketSingleton.getInstance().broadcast({
      action: "REMOVE-ROOM",
      data: this.room.toRealTimePresentation(),
    });
    MercuryRoomList.deleteRoom(this.room);
  }
}
