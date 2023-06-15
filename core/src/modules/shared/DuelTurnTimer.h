#ifndef DUEL_TURN_TIMER
#define DUEL_TURN_TIMER

#include <chrono>
#include <cstdint>
#include <array>
#include <iostream>

#include <boost/asio/io_context.hpp>
#include <boost/asio/io_context_strand.hpp>
#include <boost/asio/system_timer.hpp>
#include <boost/asio/bind_executor.hpp>

using AsioTimer = boost::asio::system_timer;

class DuelTurnTimer
{
public:
  static DuelTurnTimer &getInstance();

  void resetTimers(uint32_t limitInSeconds);
  std::array<std::chrono::milliseconds, 2U> timeRemaining;
	void expiresAfter(uint8_t team, const AsioTimer::duration& expiryTime);
	AsioTimer::time_point expiry(uint8_t team) const;
	void cancel(uint8_t team);

private:
  DuelTurnTimer();
  DuelTurnTimer(const DuelTurnTimer &) = delete;
  DuelTurnTimer &operator=(const DuelTurnTimer &) = delete;
  ~DuelTurnTimer();
  boost::asio::io_context ioContext;
  boost::asio::io_context::strand strand;
  std::array<AsioTimer, 2U> timers;
};

#endif // DUEL_TIMER
