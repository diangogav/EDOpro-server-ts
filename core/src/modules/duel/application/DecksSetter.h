#ifndef DECKS_SETTER
#define DECKS_SETTER

#include "../infrastructure/OCGRepository.h"

class DecksSetter
{
public:
  DecksSetter(OCGRepository repository, OCG_Duel duel, uint8_t isTeam1GoingFirst);
  void run();

private:
  uint8_t isTeam1GoingFirst;
  OCGRepository repository;
  OCG_Duel duel;
  uint8_t calculateTeam(uint8_t team);
};

#endif