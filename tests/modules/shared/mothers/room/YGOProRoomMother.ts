import { faker } from "@faker-js/faker";
import EventEmitter from "events";

import { PlayerInfoMessageMother } from "../PlayerInfoMessageMother";
import { MessageRepositoryMock } from "../../mocks/MessageRepositoryMock";
import { YGOProRoom } from "../../../../../src/mercury/room/domain/YGOProRoom";
import { LoggerMock } from "../../mocks/logger/LoggerMock";
import { randomInt } from "crypto";

export class YGOProRoomMother {
    static create({ command }: { command: string }): YGOProRoom {
        const socketId = faker.string.uuid();
        const id = randomInt(0, 10000);
        return YGOProRoom.create(
            id,
            command,
            new LoggerMock(),
            new EventEmitter(),
            PlayerInfoMessageMother.create(),
            socketId,
            new MessageRepositoryMock(),
        );
    }
}
