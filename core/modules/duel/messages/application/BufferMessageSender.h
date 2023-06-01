#ifndef BUFFER_MESSAGE_SENDER
#define BUFFER_MESSAGE_SENDER

#include <vector>
#include <iostream>

class BufferMessageSender {
public:
  void send(uint8_t team, uint32_t location, uint8_t con, std::vector<uint8_t> message);
};

#endif