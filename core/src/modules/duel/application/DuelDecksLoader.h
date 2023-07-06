#ifndef DUEL_DECKS_LOADER
#define DUEL_DECKS_LOADER

#include "../infrastructure/OCGRepository.h"
#include "assert.h"
#include <json/json.h>
#include <json/value.h>
#include <random>
#include <algorithm>
class DuelDecksLoader
{
public:
  DuelDecksLoader(OCGRepository repository, OCG_Duel duel, uint8_t isTeam1GoingFirst, uint8_t shuffle);
  void load(Json::Value players);

private:
  uint8_t shuffle;
  uint8_t calculateTeam(uint8_t team);
  uint8_t isTeam1GoingFirst;
  OCGRepository repository;
  OCG_Duel duel;
  std::vector<uint32_t>  shuffle_deck(std::vector<uint32_t> deck);
};

#endif