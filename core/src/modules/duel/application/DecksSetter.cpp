#include "DecksSetter.h"
#include "../messages/application/BufferMessageSender.h"
#include "assert.h"

DecksSetter::DecksSetter(OCGRepository repository, OCG_Duel duel, uint8_t isTeam1GoingFirst) : repository{repository}, duel{duel}, isTeam1GoingFirst{isTeam1GoingFirst} {}

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
  query.loc = 0x40;

  BufferMessageSender sender;

  query.con = 0U;
  std::vector<uint8_t> playerBuffer = repository.duelQueryLocation(duel, query);
  sender.send(0, this->calculateTeam(query.con), 0x40, 0, playerBuffer);

  query.con = 1U;
  std::vector<uint8_t> opponentBuffer = repository.duelQueryLocation(duel, query);
  sender.send(0, this->calculateTeam(query.con), 0x40, 1, opponentBuffer);

  std::cout << "CMD:DUEL" << std::endl;
}

uint8_t DecksSetter::calculateTeam(uint8_t team)
{
  assert(team <= 1U);
  return this->isTeam1GoingFirst ^ team;
}