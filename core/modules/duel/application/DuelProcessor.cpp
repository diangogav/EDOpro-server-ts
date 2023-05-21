#include "./DuelProcessor.h"
#include "iostream"

DuelProcessor::DuelProcessor(OCGRepository repository) : repository{repository} {}

int DuelProcessor::run(OCG_Duel duel)
{
  return repository.process(duel);
}