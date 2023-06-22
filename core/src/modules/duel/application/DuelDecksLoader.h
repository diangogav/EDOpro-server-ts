#ifndef DUEL_DECKS_LOADER
#define DUEL_DECKS_LOADER

#include "../infrastructure/OCGRepository.h"
#include "assert.h"

class DuelDecksLoader
{
public:
  DuelDecksLoader(OCGRepository repository, OCG_Duel duel, uint8_t isTeam1GoingFirst);
  void load(std::vector<int> playerMainDeck, std::vector<int> opponentMainDeck);

private:
  uint8_t calculateTeam(uint8_t team);
  uint8_t isTeam1GoingFirst;
  OCGRepository repository;
  OCG_Duel duel;
};

#endif