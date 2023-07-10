#ifndef TIME_LIMIT_MESSAGE_SENDER
#define TIME_LIMIT_MESSAGE_SENDER

#include <vector>
#include <iostream>
#include <cstdint>

class TimeLimitMessageSender {
public:
  void send(uint8_t team, uint16_t timeLeft);
};

#endif
