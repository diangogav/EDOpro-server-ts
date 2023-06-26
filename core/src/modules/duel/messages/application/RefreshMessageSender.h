#ifndef REFRESH_MESSAGE_SENDER
#define REFRESH_MESSAGE_SENDER

#include <vector>
#include <iostream>

class RefreshMessageSender {
public:
  void send(uint8_t reconnectingTeam, uint8_t team, uint32_t location, uint8_t con, std::vector<uint8_t> message);
};

#endif