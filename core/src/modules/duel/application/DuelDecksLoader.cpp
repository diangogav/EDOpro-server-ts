#include "DuelDecksLoader.h"

DuelDecksLoader::DuelDecksLoader(OCGRepository repository, OCG_Duel duel, uint8_t isTeam1GoingFirst) : repository{repository}, duel{duel}, isTeam1GoingFirst{isTeam1GoingFirst}  {}

void DuelDecksLoader::load(std::vector<int> playerMainDeck, std::vector<int> opponentMainDeck)
{
  OCG_NewCardInfo cardInfo{};

  cardInfo.team = this->calculateTeam(0U);
  cardInfo.duelist = 0;
  cardInfo.con = this->calculateTeam(0U);
  cardInfo.loc = 1;
  cardInfo.seq = 0;
  cardInfo.pos = 8;

  for (auto code : playerMainDeck)
  {
    cardInfo.code = code;
    repository.addCard(duel, cardInfo);
  }

  cardInfo.team = this->calculateTeam(1U);
  cardInfo.duelist = 0;
  cardInfo.con = this->calculateTeam(1U);
  cardInfo.loc = 1;
  cardInfo.seq = 0;
  cardInfo.pos = 8;

  for (auto code : opponentMainDeck)
  {
    cardInfo.code = code;
    repository.addCard(duel, cardInfo);
  }
}

uint8_t DuelDecksLoader::calculateTeam(uint8_t team)
{
  assert(team <= 1U);
  return isTeam1GoingFirst ^ team;
}
