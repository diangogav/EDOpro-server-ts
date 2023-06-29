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

void DuelTimeRemainingCalculator::reduce(uint8_t team)
{
  DuelTurnTimer &timer = DuelTurnTimer::getInstance();

  auto delta = timer.expiry(team) - std::chrono::system_clock::now();

  timer.timeRemaining[team] = std::chrono::duration_cast<std::chrono::milliseconds>(std::chrono::ceil<std::chrono::seconds>(delta));

  timer.cancel(team);
}
