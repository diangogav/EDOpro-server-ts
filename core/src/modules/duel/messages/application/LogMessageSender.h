#ifndef LOG_MESSAGE_SENDER
#define LOG_MESSAGE_SENDER

#include <vector>
#include <iostream>
#include <cstdint>

class LogMessageSender {
public:
  void send(std::vector<uint8_t> message);
};

#endif
