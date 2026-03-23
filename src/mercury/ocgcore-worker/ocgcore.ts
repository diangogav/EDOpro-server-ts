import { initWorker, WorkerInstance } from "yuzuthread";
import {
  NetPlayerType,
  YGOProMsgBase,
  YGOProMsgResponseBase,
  YGOProMsgRetry,
  YGOProStocGameMsg,
  YGOProMsgUpdateCard,
  YGOProMsgUpdateData,
} from "ygopro-msg-encode";
import { MayBeArray } from "nfkit";

import { MercuryClient } from "../client/domain/MercuryClient";
import { MercuryRoom } from "../room/domain/MercuryRoom";
import { calculateOcgcoreDeck } from "../utils/calculate-ocgcore-deck";
import { generateSeed } from "../utils/generate-seed";
import { OcgcoreWorker } from "./ocgcore-worker";
import { Logger } from "src/shared/logger/domain/Logger";

const isUpdateMessage = (message: YGOProMsgBase) =>
  message instanceof YGOProMsgUpdateData ||
  message instanceof YGOProMsgUpdateCard;

type Client = MercuryClient;

export class OCGCore {
  private ocgcore: WorkerInstance<OcgcoreWorker> | null;
  private responsePos: number | null = null;
  private lastResponseRequestMsg: YGOProMsgBase | null = null;
  private isRetrying = false;

  constructor(
    private readonly room: MercuryRoom,
    private readonly logger: Logger,
  ) {
    this.ocgcore = null;
  }

  async init(): Promise<void> {
    const extraScriptPaths = [
      "./script/patches/entry.lua",
      "./script/special.lua",
      "./script/init.lua",
      ...this.room.getScriptPaths(),
    ];

    const cardStorage = await this.room.getCardStorage();
    const cardReader = await this.room.getCardReader();
    const ocgcoreWasmBinary = await this.room.ocgCoreBinary();

    const registry: Record<string, string> = {
      duel_mode: this.room.duelMode,
      start_lp: String(this.room.hostInfo.start_lp),
      start_hand: String(this.room.hostInfo.start_hand),
      draw_count: String(this.room.hostInfo.draw_count),
      player_type_0: "0",
      player_type_1: "1",
    };

    this.room.clients.forEach((player, index) => {
      registry[`player_name_${index}`] = player.name;
    });

    const decks = this.room.clients.map((player: MercuryClient) =>
      calculateOcgcoreDeck(player.deck!, this.room.hostInfo, cardReader),
    );

    try {
      this.ocgcore = await initWorker(OcgcoreWorker, {
        seed: generateSeed(),
        hostinfo: this.room.hostInfo,
        ygoproPaths: this.room.getYGOProPaths(),
        extraScriptPaths,
        cardStorage,
        ocgcoreWasmBinary,
        registry,
        decks,
      });

      this.ocgcore.message$.subscribe((msg) => {
        this.logger.info("Received message from OCGCoreWorker");
        this.logger.info({ message: msg.message, type: msg.type });
      });
    } catch (error) {
      this.logger.error(error);
      throw error;
    }
  }

  async queryFieldCount({
    team,
    location,
  }: {
    team: number;
    location: number;
  }): Promise<number> {
    return this.ocgcore!.queryFieldCount({ player: team, location });
  }

  async advance(): Promise<void> {}

  // ============================================================
  // Route Game Msg - Parte 1: Entry point y refresh logic
  // ============================================================

  async routeGameMsg(
    message: YGOProMsgBase,
    options: { sendToClient?: MayBeArray<Client> } = {},
  ): Promise<void> {
    if (!message) {
      return;
    }

    const shouldRefreshFirst =
      message instanceof YGOProMsgResponseBase && !isUpdateMessage(message);
    if (shouldRefreshFirst) {
      await this.refreshForMessage(message);
    }

    const sendToClients = options.sendToClient
      ? new Set(
          Array.isArray(options.sendToClient)
            ? options.sendToClient
            : [options.sendToClient],
        )
      : undefined;

    await this.sendToTargets(message, sendToClients);

    if (!isUpdateMessage(message) && !shouldRefreshFirst) {
      await this.refreshForMessage(message);
    }

    await this.handleResponseOrRetry(message);
  }

  private async refreshForMessage(_message: YGOProMsgBase): Promise<void> {
    // TODO: Implementar refresh de estado del campo
    this.logger.debug({
      msg: "refreshForMessage",
      type: _message.constructor.name,
    });
  }

  private async sendToTargets(
    message: YGOProMsgBase,
    sendToClients?: Set<Client>,
  ): Promise<void> {
    const sendTargets = message.getSendTargets();
    const sendGameMsg = (c: Client, msg: YGOProMsgBase) =>
      c.sendMessageToClient(
        Buffer.from(
          new YGOProStocGameMsg().fromPartial({ msg }).toFullPayload(),
        ),
      );

    await Promise.all(
      sendTargets.map(async (pos) => {
        if (pos === NetPlayerType.OBSERVER) {
          const observerView = message.observerView();
          const watchers = this.room.spectators as MercuryClient[];
          await Promise.all(watchers.map((w) => sendGameMsg(w, observerView)));
        } else {
          const players = this.getIngameDuelPosPlayers(pos);
          await Promise.all(
            players.map(async (c) => {
              if (sendToClients && !sendToClients.has(c)) {
                return;
              }
              const duelPos = this.getIngameDuelPos(c);
              const playerView = message.playerView(duelPos);
              const operatingPlayer = this.getIngameOperatingPlayer(duelPos);
              if (
                message instanceof YGOProMsgResponseBase &&
                c !== operatingPlayer
              ) {
                return;
              }
              return sendGameMsg(
                c,
                c === operatingPlayer ? playerView : playerView.teammateView(),
              );
            }),
          );
        }
      }),
    );
  }

  private async handleResponseOrRetry(message: YGOProMsgBase): Promise<void> {
    if (message instanceof YGOProMsgResponseBase) {
      this.setLastResponseRequestMsg(message);
      await this.sendWaitingToNonOperator(message.responsePlayer());
      await this.setResponseTimer(this.responsePos!);
      return;
    }
    if (message instanceof YGOProMsgRetry && this.responsePos != null) {
      this.isRetrying = true;
      await this.sendWaitingToNonOperator(
        this.getIngameDuelPosByDuelPos(this.responsePos),
      );
      await this.setResponseTimer(this.responsePos);
      return;
    }
    if (
      this.responsePos != null &&
      !this.lastResponseRequestMsg &&
      !(message instanceof YGOProMsgResponseBase)
    ) {
      this.responsePos = null;
    }
  }

  // ============================================================
  // Route Game Msg - Parte 2: Helpers de routing
  // ============================================================

  private getIngameDuelPosPlayers(pos: number): Client[] {
    // Retorna los clientes en una posición de duelo específica
    const clients = this.room.clients as MercuryClient[];
    return clients.filter((c) => {
      const cPos = this.getIngameDuelPos(c);
      return cPos === pos;
    });
  }

  private getIngameDuelPos(client: Client): number {
    // Retorna la posición de duelo del cliente (0 o 1)
    return client.position;
  }

  private getIngameOperatingPlayer(duelPos: number): Client | null {
    // Retorna el cliente que debe responder en esta posición
    const players = this.getIngameDuelPosPlayers(duelPos);
    return players[0] ?? null;
  }

  private getIngameDuelPosByDuelPos(duelPos: number): number {
    // Convierte posición de duelo a posición ingame
    return duelPos;
  }

  private setLastResponseRequestMsg(message: YGOProMsgBase): void {
    this.lastResponseRequestMsg = message;
  }

  private async sendWaitingToNonOperator(_player: number): Promise<void> {
    // TODO: Implementar envío de mensaje de espera
    this.logger.debug("sendWaitingToNonOperator", { player: _player });
  }

  private async setResponseTimer(_pos: number): Promise<void> {
    // TODO: Implementar timer de respuesta
    this.logger.debug("setResponseTimer", { pos: _pos });
  }
}
