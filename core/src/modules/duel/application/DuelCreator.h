#ifndef DUEL_CREATOR
#define DUEL_CREATOR

#include "../infrastructure/OCGRepository.h"
#include "../../card/infrastructure/CardSqliteRepository.h"
#include "../../shared/FileReader.h"
#include <shared_mutex>

class DuelCreator
{
private:
  OCGRepository repository;
  FileReader fileReader;
public:
  DuelCreator(OCGRepository repository);
  OCG_Duel run(CardSqliteRepository& db, uint64_t flags, uint32_t startingLP, uint32_t startingDrawCount, uint32_t drawCountPerTurn, uint16_t extraRules, uint64_t randomSeed1, uint64_t randomSeed2, uint64_t randomSeed3, uint64_t randomSeed4);

};

#endif