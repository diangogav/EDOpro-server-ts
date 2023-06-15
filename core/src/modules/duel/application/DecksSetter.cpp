#include "DecksSetter.h"
#include "../messages/application/BufferMessageSender.h"

DecksSetter::DecksSetter(OCGRepository repository, OCG_Duel duel) : repository{repository}, duel{duel} {}

void DecksSetter::run()
{
  OCG_QueryInfo query = {
      0x1181FFF,
      0U,
      0x01,
      0U,
      0U};

  repository.duelQueryLocation(duel, query);

  query.con = 1U;

  repository.duelQueryLocation(duel, query);

  query.flags = 0x381FFF;
  query.con = 0U;
  query.loc = 0x40;

  std::vector<uint8_t> playerBuffer = repository.duelQueryLocation(duel, query);
  query.con = 1U;
  std::vector<uint8_t> opponentBuffer = repository.duelQueryLocation(duel, query);

  BufferMessageSender sender;

  sender.send(0, 0x40, 0, playerBuffer);
  sender.send(1, 0x40, 1, opponentBuffer);

  std::cout << "CMD:DUEL" << std::endl;
}
