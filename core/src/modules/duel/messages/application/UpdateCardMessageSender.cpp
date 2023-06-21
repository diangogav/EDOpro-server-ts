#include "UpdateCardMessageSender.h"

void UpdateCardMessageSender::send(uint8_t team, uint32_t location, uint8_t con, uint8_t sequence, std::vector<uint8_t> message)
{
  std::string payload = "CMD:CARD|";
  payload += std::to_string(team) + "|";
  payload += std::to_string(location) + "|";
  payload += std::to_string(con) + "|";
  payload += std::to_string(sequence) + "|";

  for (const auto &element : message)
  {
    payload += std::to_string(static_cast<int>(element)) + "|";
  }

  std::cout << payload << std::endl;
}