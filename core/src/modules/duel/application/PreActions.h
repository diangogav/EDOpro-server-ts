#ifndef PRE_ACTIONS
#define PRE_ACTIONS

#include "../../shared/DuelStages.h"
#include "../../shared/Replier.h"
#include "./DuelTimeRemainingCalculator.h"
#include "../messages/application/TimeLimitMessageSender.h"

#include <vector>
#include <iostream>
#include <chrono>
#include "assert.h"

class PreActions {
public:
  PreActions(uint16_t timeLimitsInSeconds, uint8_t isTeam1GoingFirst);
  void run(std::vector<uint8_t> message);
private:
  bool DoesMessageRequireAnswer(uint8_t messageType);
  uint16_t timeLimitsInSeconds;
  uint8_t calculateTeam(uint8_t team);
  uint8_t isTeam1GoingFirst;
  uint8_t getMessageReceivingTeam(std::vector<uint8_t> message);
};

#endif