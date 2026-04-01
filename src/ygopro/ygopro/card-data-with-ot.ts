import { BinaryField } from 'ygopro-msg-encode';
import { CardDataEntry } from 'ygopro-cdb-encode';

const CARD_DATA_PAYLOAD_SIZE = new CardDataEntry().toPayload().length;

export class CardDataWithOt extends CardDataEntry {
  @BinaryField('u8', CARD_DATA_PAYLOAD_SIZE)
  declare ot: number;
}

export const CARD_DATA_WITH_OT_PAYLOAD_SIZE =
  new CardDataWithOt().toPayload().length;
