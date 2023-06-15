#ifndef DUEL_SCRIPTS_LOADER
#define DUEL_SCRIPTS_LOADER

#include "../infrastructure/OCGRepository.h"

class DuelScriptsLoader {
public:
  DuelScriptsLoader(OCGRepository repository, OCG_Duel duel);
  void load();

private:
  OCGRepository repository;
  OCG_Duel duel;
};

#endif