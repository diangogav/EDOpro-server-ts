#ifndef DUEL_PROCESSOR
#define DUEL_PROCESSOR

#include "../infrastructure/OCGRepository.h"
#include <vector>
#include <cstdint>

class DuelProcessor
{
private:
  OCGRepository repository;

public:
  DuelProcessor(OCGRepository repository);
  int run(OCG_Duel duel);
};

#endif