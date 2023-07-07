#ifndef PRE_ACTIONS
#define PRE_ACTIONS

#include "../../shared/DuelStages.h"
#include "../../shared/Replier.h"
#include "./DuelTimeRemainingCalculator.h"
#include "../messages/application/TimeLimitMessageSender.h"
#include "../messages/application/NewTurnMessageSender.h"
#include "../messages/application/DuelMessageSender.h"


#include <vector>
#include <iostream>
#include <chrono>
#include "assert.h"

class PreActions {
public:
  PreActions(uint16_t timeLimitsInSeconds, uint8_t isTeam1GoingFirst);
  bool run(std::vector<uint8_t> message);
private:
  NewTurnMessageSender turnMessageSender;
  DuelMessageSender duelMessageSender;
  bool DoesMessageRequireAnswer(uint8_t messageType);
  uint16_t timeLimitsInSeconds;
  uint8_t calculateTeam(uint8_t team);
  uint8_t isTeam1GoingFirst;
  uint8_t getMessageReceivingTeam(std::vector<uint8_t> message);
  std::vector<uint8_t> lastHint;
  std::vector<uint8_t> lastRequest;
};

#endif