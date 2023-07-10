#ifndef DUEL_MESSAGE_SENDER
#define DUEL_MESSAGE_SENDER

#include <vector>
#include <iostream>
#include <cstdint>

class DuelMessageSender {
public:
  void send(int all, int cache, uint8_t team, std::vector<uint8_t> message);
};

#endif
