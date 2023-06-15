#ifndef DECKS_SETTER
#define DECKS_SETTER

#include "../infrastructure/OCGRepository.h"

class DecksSetter
{
public:
  DecksSetter(OCGRepository repository, OCG_Duel duel);
  void run();

private:
  OCGRepository repository;
  OCG_Duel duel;
};

#endif