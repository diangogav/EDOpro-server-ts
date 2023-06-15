#ifndef RESPONSE_HANDLER
#define RESPONSE_HANDLER

#include <vector>
#include <iostream>
#include <chrono>

#include "../../infrastructure/OCGRepository.h"
#include "../../../shared/Replier.h"
#include "../../../shared/DuelTurnTimer.h"

class ResponseHandler
{
public:
  ResponseHandler(OCG_Duel duel, OCGRepository repository, uint16_t timeLimit);
  void handle(uint8_t team, std::vector<uint8_t> message);

private:
  uint16_t timeLimit;
  OCGRepository repository;
  OCG_Duel duel;
};

#endif