#ifndef DUEL_CREATOR
#define DUEL_CREATOR

#include "../infrastructure/OCGRepository.h"
#include "../../shared/FileReader.h"

class DuelCreator {
private:
  OCGRepository repository;
  FileReader fileReader;
public:
  DuelCreator(OCGRepository repository);
  void run(uint64_t flags, uint32_t startingLP, uint32_t startingDrawCount, uint32_t drawCountPerTurn, uint16_t extraRules);
};

#endif