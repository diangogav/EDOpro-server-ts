#ifndef DUEL_STARTER
#define DUEL_STARTER

#include "../infrastructure/OCGRepository.h"

class DuelStarter {
public:
  DuelStarter(OCGRepository repository, OCG_Duel duel);
  void start();

private:
  OCGRepository repository;
  OCG_Duel duel;
};

#endif