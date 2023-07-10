#ifndef DUEL_FINISH_HANDLER
#define DUEL_FINISH_HANDLER

#include "../../shared/DuelStages.h"
#include "../messages/application/DuelFinishedMessageSender.h"

#include <vector>
#include <iostream>
#include <cstdint>
#include <cassert>

class DuelFinishHandler
{
public:
  DuelFinishHandler(uint8_t isTeam1GoingFirst);
  bool handle(std::vector<uint8_t> message);

private: 
  DuelFinishedMessageSender sender;
  uint8_t isTeam1GoingFirst;
  uint8_t calculateTeam(uint8_t team);
};

#endif
