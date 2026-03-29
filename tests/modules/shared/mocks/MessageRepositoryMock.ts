import { MessageRepository } from "../../../../src/shared/messages/MessageRepository";

export class MessageRepositoryMock extends MessageRepository {
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
