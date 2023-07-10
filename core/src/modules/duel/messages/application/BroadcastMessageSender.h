#ifndef BROADCAST_MESSAGE_HANDLER
#define BROADCAST_MESSAGE_HANDLER

#include <vector>
#include <iostream>
#include <cstdint>

class BroadcastMessageSender {
public:
  void send(std::vector<uint8_t> message);
  void sendExceptTo(uint8_t team, std::vector<uint8_t> message);
};

#endif
