import { MessageRepository } from "@shared/messages/MessageRepository";
import { ErrorMessageType, YGOProStocDeckCount_DeckInfo, YGOProStocDuelStart, YGOProStocErrorMsg, YGOProStocHsPlayerChange, YGOProStocHsPlayerEnter, YGOProStocHsWatchChange, YGOProStocJoinGame, YGOProStocTypeChange } from "ygopro-msg-encode";
import { HostInfo } from "../domain/host-info/HostInfo";

export class YGOProMessageRepository extends MessageRepository {
  typeChangeMessageFromType(type: number): Buffer {
    const message = new YGOProStocTypeChange().fromPartial({
      type,
    });

    return Buffer.from(message.toFullPayload());
  }

  watchChangeMessage(watchCount: number): Buffer {
    const message = new YGOProStocHsWatchChange().fromPartial({
      watch_count: watchCount,
    });

    return Buffer.from(message.toFullPayload());
  }

  playerChangeMessage(position: number, state: number): Buffer {
    const message = new YGOProStocHsPlayerChange().fromPartial({
      playerPosition: position,
      playerState: state,
    });

    return Buffer.from(message.toFullPayload());
  }

  playerEnterMessage(name: string, position: number): Buffer {
    const message = new YGOProStocHsPlayerEnter().fromPartial({
      name,
      pos: position,
    });

    return Buffer.from(message.toFullPayload());
  }

  typeChangeMessage(position: number, isHost: boolean) {
    const message = new YGOProStocTypeChange().fromPartial({
      playerPosition: position,
      isHost,
    });

    return Buffer.from(message.toFullPayload());
  }

  joinGameMessage(hostInfo: HostInfo): Buffer {
    const message = new YGOProStocJoinGame().fromPartial({
      info: hostInfo,
    });

    return Buffer.from(message.toFullPayload());
  }

  duelStartMessage(): Buffer {
    const message = new YGOProStocDuelStart()
    return Buffer.from(message.toFullPayload());
  }

  errorMessage(errorCode: ErrorMessageType): Buffer {
    const message = new YGOProStocErrorMsg().fromPartial({
      msg: errorCode,
    });

    return Buffer.from(message.toFullPayload());
  }
}
