#include "DuelDecksLoader.h"

DuelDecksLoader::DuelDecksLoader(OCGRepository repository, OCG_Duel duel, uint8_t isTeam1GoingFirst) : repository{repository}, duel{duel}, isTeam1GoingFirst{isTeam1GoingFirst} {}

void DuelDecksLoader::load(Json::Value players)
{

  for (const auto &item : players)
  {
    OCG_NewCardInfo cardInfo{};
    uint8_t team = item["team"].asInt();
    uint8_t turn = item["turn"].asInt();
    Json::Value deck = item["mainDeck"];

    cardInfo.team = this->calculateTeam(team);
    cardInfo.duelist = turn;
    cardInfo.con = this->calculateTeam(team);
    cardInfo.loc = 1;
    cardInfo.seq = 0;
    cardInfo.pos = 8;

    for (const auto &card : deck)
    {
      cardInfo.code = card.asInt();
      repository.addCard(duel, cardInfo);
    }
  }
}

uint8_t DuelDecksLoader::calculateTeam(uint8_t team)
{
  assert(team <= 1U);
  return isTeam1GoingFirst ^ team;
}
