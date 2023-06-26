#include "RefreshMessageSender.h"

void RefreshMessageSender::send(uint8_t reconnectingTeam, uint8_t team, uint32_t location, uint8_t con, std::vector<uint8_t> message)
{
  std::string payload = "CMD:REFRESH|";
  payload += std::to_string(reconnectingTeam) + "|";
  payload += std::to_string(team) + "|";
  payload += std::to_string(location) + "|";
  payload += std::to_string(con) + "|";

  for (const auto &element : message)
  {
    payload += std::to_string(static_cast<int>(element)) + "|";
  }

  std::cout << payload << std::endl;
}