#ifndef DUEL_MESSAGE_HANDLER
#define DUEL_MESSAGE_HANDLER

#include <iostream>
#include <vector>
#include "assert.h"
#include "../../../shared/DuelStages.h"
#include "../../../shared/MessageTargets.h"
#include "../application/DrawCardHandler.h"
#include "../application/BroadcastMessageSender.h"

class DuelMessageHandler {
public:
  DuelMessageHandler(uint8_t isTeam1GoingFirst, uint16_t timeLimitsInSeconds);
  void handle(std::vector<uint8_t> message);
private:
  BroadcastMessageSender sender;
  DrawCardHandler handler;
  uint8_t isTeam1GoingFirst;
  uint16_t timeLimitsInSeconds;
  uint8_t calculateTeam(uint8_t team);
  MessageTargets getMessageTarget(const std::vector<uint8_t>& msg) noexcept;
  uint8_t getTeamMessageReceptor(const std::vector<uint8_t>& msg) noexcept;
};

#endif