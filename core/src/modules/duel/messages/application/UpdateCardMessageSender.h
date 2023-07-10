#ifndef UPDATE_CARD_MESSAGE_SENDER
#define UPDATE_CARD_MESSAGE_SENDER

#include <vector>
#include <iostream>
#include <cstdint>

class UpdateCardMessageSender {
public:
  void send(int cache, uint8_t team, uint32_t location, uint8_t con, uint8_t sequence, std::vector<uint8_t> message);
};

#endif
