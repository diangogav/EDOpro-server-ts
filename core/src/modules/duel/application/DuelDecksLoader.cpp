#include "DuelDecksLoader.h"

DuelDecksLoader::DuelDecksLoader(OCGRepository repository, OCG_Duel duel, uint8_t isTeam1GoingFirst, uint8_t shuffle) : 
repository{repository}, 
duel{duel}, 
isTeam1GoingFirst{isTeam1GoingFirst},
shuffle{shuffle}
{}

void DuelDecksLoader::load(Json::Value players)
{

  for (const auto &item : players)
  {
    OCG_NewCardInfo cardInfo{};
    uint8_t team = item["team"].asInt();
    uint8_t turn = item["turn"].asInt();
    Json::Value deck = item["mainDeck"];
    Json::Value extraDeck = item["extraDeck"];
    std::vector<uint32_t> main_deck;

    cardInfo.team = this->calculateTeam(team);
    cardInfo.duelist = turn;
    cardInfo.con = this->calculateTeam(team);
    cardInfo.loc = 1;
    cardInfo.seq = 0;
    cardInfo.pos = 8;

    for (const auto &card : deck)
    {
      main_deck.push_back(card.asInt());
    }

    std::vector<uint32_t> shuffled_deck = this->shuffle_deck(main_deck);

    for (const auto &card : shuffled_deck)
    {
      cardInfo.code = card;
      repository.addCard(duel, cardInfo);
    }

    cardInfo.loc = 0x40;

    for (const auto &card : extraDeck)
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


std::vector<uint32_t> DuelDecksLoader::shuffle_deck(std::vector<uint32_t> deck)
{
  if (this->shuffle == 0U)
  {
    return deck;
  }

  std::random_device rd;
  std::mt19937 generator(rd());

  std::shuffle(deck.begin(), deck.end(), generator);

  return deck;
}