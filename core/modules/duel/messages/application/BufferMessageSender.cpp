#include "BufferMessageSender.h"

void BufferMessageSender::send(uint8_t team, uint32_t location, uint8_t con, std::vector<uint8_t> message)
{
  std::string payload = "CMD:BUFFER|";
  payload += std::to_string(team) + "|";
  payload += std::to_string(location) + "|";
  payload += std::to_string(con) + "|";

  for (const auto &element : message)
  {
    payload += std::to_string(static_cast<int>(element)) + "|";
  }

  std::cout << payload << std::endl;
}