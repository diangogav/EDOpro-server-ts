#include "FieldMessageSender.h"

void FieldMessageSender::send(int team, std::vector<uint8_t> message)
{
  std::string payload = "CMD:FIELD|";
  payload += std::to_string(team) + "|";

  for (const auto &element : message)
  {
    payload += std::to_string(static_cast<int>(element)) + "|";
  }

  std::cout << payload << std::endl;
}