#include "DuelDecksLoader.h"

DuelDecksLoader::DuelDecksLoader(OCGRepository repository, OCG_Duel duel) : repository{repository}, duel{duel} {}

void DuelDecksLoader::load(std::vector<int> playerMainDeck, std::vector<int> opponentMainDeck)
{
  OCG_NewCardInfo cardInfo{};

  cardInfo.team = 0;
  cardInfo.duelist = 0;
  cardInfo.con = 0;
  cardInfo.loc = 1;
  cardInfo.seq = 0;
  cardInfo.pos = 8;

  for (auto code : playerMainDeck)
  {
    cardInfo.code = code;
    repository.addCard(duel, cardInfo);
  }

  cardInfo.team = 1;
  cardInfo.duelist = 0;
  cardInfo.con = 1;
  cardInfo.loc = 1;
  cardInfo.seq = 0;
  cardInfo.pos = 8;

  for (auto code : opponentMainDeck)
  {
    cardInfo.code = code;
    repository.addCard(duel, cardInfo);
  }
}