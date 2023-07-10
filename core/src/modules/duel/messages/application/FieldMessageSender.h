#ifndef FIELD_MESSAGE_HANDLER
#define FIELD_MESSAGE_HANDLER

#include <vector>
#include <iostream>
#include <cstdint>

class FieldMessageSender {
public:
  void send(int team, std::vector<uint8_t> message);
};

#endif
