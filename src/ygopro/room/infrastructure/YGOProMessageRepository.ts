import { MessageRepository } from "@shared/messages/MessageRepository";
import { ErrorMessageType, YGOProMsgWin, YGOProStocChangeSide, YGOProStocDuelStart, YGOProStocErrorMsg, YGOProStocGameMsg, YGOProStocHandResult, YGOProStocHsPlayerChange, YGOProStocHsPlayerEnter, YGOProStocHsWatchChange, YGOProStocJoinGame, YGOProStocSelectHand, YGOProStocSelectTp, YGOProStocTypeChange, YGOProStocWaitingSide } from "ygopro-msg-encode";
import { HostInfo } from "../domain/host-info/HostInfo";

export class YGOProMessageRepository extends MessageRepository {
  waitingSideMessage(): Buffer {
    return Buffer.from(
      new YGOProStocWaitingSide().toFullPayload(),
    );
  }

  winMessage(winner: number, reason: number): Buffer {
    const message = new YGOProStocGameMsg().fromPartial({
      msg: new YGOProMsgWin().fromPartial({
        player: winner,
        type: reason,
      }),
    });
    return Buffer.from(message.toFullPayload());
  }

  changeSideMessage(): Buffer {
    return Buffer.from(new YGOProStocChangeSide().toFullPayload());
  }

  handResultMessage(response1: number, response2: number): Buffer {
    const message = new YGOProStocHandResult().fromPartial({
      res1: response1,
      res2: response2,
    });
    return Buffer.from(message.toFullPayload());
  }

  selectTpMessage(): Buffer {
    const message = new YGOProStocSelectTp();
    return Buffer.from(message.toFullPayload());
  }

  selectHandMessage(): Buffer {
    const message = new YGOProStocSelectHand();
    return Buffer.from(message.toFullPayload());
  }

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

  errorMessage(type: ErrorMessageType, code: number): Buffer {
    const message = new YGOProStocErrorMsg().fromPartial({
      msg: type,
      code,
    });

    return Buffer.from(message.toFullPayload());
  }
}
