#include "DuelTurnTimer.h"
#include <iostream>

DuelTurnTimer &DuelTurnTimer::getInstance()
{
  static DuelTurnTimer instance;
  return instance;
}

constexpr auto GRACE_PERIOD = std::chrono::seconds(5);

void DuelTurnTimer::resetTimers(uint32_t limitInSeconds)
{
  using namespace std::chrono;
  const auto secs = seconds(limitInSeconds) + GRACE_PERIOD;
  const auto time = duration_cast<milliseconds>(secs);
  timeRemaining[0] = time;
  timeRemaining[1] = time;
}

void DuelTurnTimer::expiresAfter(uint8_t team, const AsioTimer::duration &expiryTime)
{
  assert(team <= 1U);
  timers[team].expires_after(expiryTime);
  timers[team].async_wait(boost::asio::bind_executor(
      strand,
      [team](boost::system::error_code error)
      {
        std::cerr << "Timer expired for team: " << static_cast<int>(team) << std::endl;
      }

      ));
}

AsioTimer::time_point DuelTurnTimer::expiry(uint8_t team) const
{
  assert(team <= 1U);
  return timers[team].expiry();
}

void DuelTurnTimer::cancel(uint8_t team)
{
  assert(team <= 1U);
  timers[team].cancel();
}

DuelTurnTimer::DuelTurnTimer() : ioContext(), strand(ioContext), timers({AsioTimer(strand.context()), AsioTimer(strand.context())})
{
}

DuelTurnTimer::~DuelTurnTimer()
{
  // Liberar recursos del singleton.
}