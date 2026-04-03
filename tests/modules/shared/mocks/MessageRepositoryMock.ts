import { MessageRepository } from "../../../../src/shared/messages/MessageRepository";

export class MessageRepositoryMock extends MessageRepository {
  selectHandMessage = jest.fn().mockReturnValue(Buffer.from("select-hand"));
  selectTpMessage = jest.fn().mockReturnValue(Buffer.from("select-tp"));
  handResultMessage = jest.fn().mockReturnValue(Buffer.from("hand-result"));
  changeSideMessage = jest.fn().mockReturnValue(Buffer.from("change-side"));
  winMessage = jest.fn().mockReturnValue(Buffer.from("win"));
  waitingSideMessage = jest.fn().mockReturnValue(Buffer.from("waiting-side"));
  errorMessage = jest.fn().mockReturnValue(Buffer.from("error"));
  duelStartMessage = jest.fn().mockReturnValue(Buffer.from("duel-start"));
  joinGameMessage = jest.fn().mockReturnValue(Buffer.from("join-game"));
  typeChangeMessage = jest.fn().mockReturnValue(Buffer.from("type-change"));
  typeChangeMessageFromType = jest
    .fn()
    .mockReturnValue(Buffer.from("type-change-from-type"));
  playerEnterMessage = jest.fn().mockReturnValue(Buffer.from("player-enter"));
  playerChangeMessage = jest.fn().mockReturnValue(Buffer.from("player-change"));
  watchChangeMessage = jest.fn().mockReturnValue(Buffer.from("watch-change"));
}
