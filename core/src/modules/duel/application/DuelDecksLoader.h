#ifndef DUEL_DECKS_LOADER
#define DUEL_DECKS_LOADER

#include "../infrastructure/OCGRepository.h"

class DuelDecksLoader
{
public:
  DuelDecksLoader(OCGRepository repository, OCG_Duel duel);
  void load(std::vector<int> playerMainDeck, std::vector<int> opponentMainDeck);

private:
  OCGRepository repository;
  OCG_Duel duel;
};

#endif