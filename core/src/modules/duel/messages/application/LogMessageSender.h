#ifndef LOG_MESSAGE_SENDER
#define LOG_MESSAGE_SENDER

#include <vector>
#include <iostream>

class LogMessageSender {
public:
  void send(std::vector<uint8_t> message);
};

#endif