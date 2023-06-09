#include "DuelTimeRemainingCalculator.h"

constexpr auto GRACE_PERIOD = std::chrono::seconds(5);

uint16_t DuelTimeRemainingCalculator::calculate(uint8_t team)
{
  DuelTurnTimer &timer = DuelTurnTimer::getInstance();

  const auto timeRemaining = std::chrono::duration_cast<std::chrono::seconds>(timer.timeRemaining[team]);

	const auto apparentTimeRemaining = timeRemaining - GRACE_PERIOD;

	const auto ticks = uint16_t(std::max(apparentTimeRemaining.count(), {}));

  timer.expiresAfter(team, timeRemaining);
  
  return ticks;

}
