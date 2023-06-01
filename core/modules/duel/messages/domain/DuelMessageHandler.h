#ifndef DUEL_MESSAGE_HANDLER
#define DUEL_MESSAGE_HANDLER

#include <iostream>
#include <vector>
#include "assert.h"
#include "../../../shared/DuelStages.h"

class DuelMessageHandler {
public:
  DuelMessageHandler(uint16_t isTeam1GoingFirst);
  void handle(std::vector<uint8_t> message);
private:
  uint8_t isTeam1GoingFirst;
  uint8_t calculateTeam(uint8_t team);
};

#endif