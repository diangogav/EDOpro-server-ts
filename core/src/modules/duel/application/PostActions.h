#ifndef POST_ACTIONS
#define POST_ACTIONS

#include "../../shared/DuelStages.h"
#include "./DuelTimeRemainingCalculator.h"
#include "../messages/application/TimeLimitMessageSender.h"
#include "../../shared/Replier.h"

#include <vector>
#include <iostream>
#include <chrono>
#include "assert.h"

class PostActions {
public:
  PostActions(uint16_t timeLimitsInSeconds, uint8_t isTeam1GoingFirst);
  void run(std::vector<uint8_t> message);
private:
  bool DoesMessageRequireAnswer(uint8_t messageType);
  uint16_t timeLimitsInSeconds;
  uint8_t calculateTeam(uint8_t team);
  uint8_t isTeam1GoingFirst;
};

#endif