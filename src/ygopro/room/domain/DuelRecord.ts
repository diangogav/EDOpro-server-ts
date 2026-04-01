import YGOProDeck from 'ygopro-deck-encode';
import { YGOProYrp, ReplayHeader } from 'ygopro-yrp-encode';
import {
    NetPlayerType,
    YGOProMsgBase,
    YGOProMsgResponseBase,
    YGOProMsgStart,
    YGOProMsgWin,
    YGOProStocGameMsg,
} from 'ygopro-msg-encode';
import { YGOProRoom } from './YGOProRoom';
import { calculateDuelOptions } from '@ygopro/utils/calculate-duel-options';

// Constants from ygopro
const REPLAY_COMPRESSED = 0x1;
const REPLAY_TAG = 0x2;
const REPLAY_UNIFORM = 0x10;
const REPLAY_ID_YRP2 = 0x32707279;
const PRO_VERSION = 0x1362;

export class DuelRecord {
    constructor(
        public seed: number[],
        public players: { name: string; deck: YGOProDeck }[],
        public isSwapped: boolean,
    ) { }
    startTime = new Date();
    endTime?: Date;
    winPosition?: number;
    winReason?: number;
    responses: Buffer[] = [];
    messages: YGOProMsgBase[] = [];

    toSwappedPlayers() {
        if (!this.isSwapped) {
            return [...this.players];
        }
        const swappedPlayers = [...this.players];
        const isTag = swappedPlayers.length === 4;
        const swapElements = (a: number, b: number) => {
            const temp = swappedPlayers[a];
            swappedPlayers[a] = swappedPlayers[b];
            swappedPlayers[b] = temp;
        };
        if (isTag) {
            swapElements(0, 2);
            swapElements(1, 3);
        } else {
            swapElements(0, 1);
        }
        return swappedPlayers;
    }

    private toReplayDeck(deck: YGOProDeck | null | undefined) {
        if (!deck) {
            return null;
        }
        return new YGOProDeck({
            main: [...deck.main].reverse(),
            extra: [...deck.extra].reverse(),
            side: [...deck.side],
            name: deck.name,
        });
    }

    toYrp(room: Pick<YGOProRoom, 'hostInfo' | 'isTag'>) {
        const isTag = room.isTag;

        // Create replay header
        const header = new ReplayHeader();
        header.id = REPLAY_ID_YRP2;
        header.version = PRO_VERSION;
        header.flag = REPLAY_COMPRESSED | REPLAY_UNIFORM;
        if (isTag) {
            header.flag |= REPLAY_TAG;
        }
        header.seedSequence = this.seed;
        // Set start_time (stored in hash field) as Unix timestamp in seconds
        header.hash = Math.floor(this.startTime.getTime() / 1000);

        const players = this.toSwappedPlayers();

        // Build YGOProYrp object
        // Note: players array is already swapped
        //
        // YGOProYrp field order matches ygopro replay write order:
        // Single mode:
        //   - hostName, clientName = players[0], players[1]
        //   - hostDeck, clientDeck = players[0].deck, players[1].deck
        //
        // Tag mode (ygopro writes: players[0-3] names, then pdeck[0,1,3,2]):
        //   - hostName, tagHostName, tagClientName, clientName = players[0], players[1], players[2], players[3]
        //   - hostDeck, tagHostDeck, tagClientDeck, clientDeck = players[0], players[1], players[3], players[2]
        //     (note the deck order: 0,1,3,2 - this matches ygopro's load order)
        const yrp = new YGOProYrp({
            header,
            hostName: players[0]?.name || '',
            clientName: isTag ? players[3]?.name || '' : players[1]?.name || '',
            startLp: room.hostInfo.start_lp,
            startHand: room.hostInfo.start_hand,
            drawCount: room.hostInfo.draw_count,
            opt: calculateDuelOptions(room.hostInfo),
            hostDeck: this.toReplayDeck(players[0]?.deck),
            clientDeck: isTag
                ? this.toReplayDeck(players[2]?.deck)
                : this.toReplayDeck(players[1]?.deck),
            tagHostName: isTag ? players[1]?.name || '' : null,
            tagClientName: isTag ? players[2]?.name || '' : null,
            tagHostDeck: isTag ? this.toReplayDeck(players[1]?.deck) : null,
            tagClientDeck: isTag ? this.toReplayDeck(players[3]?.deck) : null,
            singleScript: null,
            responses: this.responses.map((buf) => new Uint8Array(buf)),
        });

        return yrp;
    }

    *toPlayback(
        cb: (msg: YGOProMsgBase) => YGOProMsgBase | undefined = (msg) => msg,
        options: {
            includeResponse?: boolean;
            includeNonObserver?: boolean;
            msgStartPos?: number;
        } = {},
    ): Generator<YGOProStocGameMsg, void, unknown> {
        let recordedWinMsg: YGOProMsgWin | undefined;

        for (let message of this.messages) {
            if (message instanceof YGOProMsgResponseBase) {
                if (!options.includeResponse) {
                    continue;
                }
            }
            if (message instanceof YGOProMsgWin) {
                if (!recordedWinMsg) {
                    recordedWinMsg = message;
                }
                continue;
            }
            if (
                !options.includeNonObserver &&
                !message.getSendTargets().includes(NetPlayerType.OBSERVER)
            ) {
                continue;
            }
            if (options.msgStartPos != null && message instanceof YGOProMsgStart) {
                message = new YGOProMsgStart().fromPartial({
                    ...message,
                    playerType: options.msgStartPos,
                });
            }
            const mappedMsg = cb(message);
            if (!mappedMsg) {
                continue;
            }
            yield new YGOProStocGameMsg().fromPartial({
                msg: mappedMsg,
            });
        }

        const winMsg = this.resolveObserverWinMsg() || recordedWinMsg;
        if (winMsg) {
            yield new YGOProStocGameMsg().fromPartial({
                msg: winMsg,
            });
        }
    }

    private resolveObserverWinMsg() {
        if (
            (this.winPosition !== 0 && this.winPosition !== 1) ||
            typeof this.winReason !== 'number'
        ) {
            return undefined;
        }
        const player = this.isSwapped ? 1 - this.winPosition : this.winPosition;
        return new YGOProMsgWin().fromPartial({
            player,
            type: this.winReason,
        });
    }
}
