#ifndef ADD_MESSAGE_TO_REPLAY
#define ADD_MESSAGE_TO_REPLAY

#include <vector>
#include <iostream>
#include <cstdint>

class AddMessageToReplaySender {
public:
  void sendUpdateData(uint8_t controller, uint32_t location, std::vector<uint8_t> message);
  void sendUpdateCard(uint8_t controller, uint32_t location, uint8_t sequence, std::vector<uint8_t> message);
  void send(std::vector<uint8_t> message);
};

#endif
