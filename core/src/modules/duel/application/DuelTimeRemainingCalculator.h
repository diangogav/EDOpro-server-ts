#ifndef DUEL_TIME_REMAINING_CALCULATOR
#define DUEL_TIME_REMAINING_CALCULATOR

#include <chrono>
#include <cstdint>

#include "../../shared/DuelTurnTimer.h"

class DuelTimeRemainingCalculator
{
public:
  uint16_t calculate(uint8_t team);

};

#endif