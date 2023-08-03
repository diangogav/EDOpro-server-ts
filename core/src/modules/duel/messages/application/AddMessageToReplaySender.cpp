#include "AddMessageToReplaySender.h"

void AddMessageToReplaySender::sendUpdateData(uint8_t controller, uint32_t location, std::vector<uint8_t> message)
{
  std::string payload = "CMD:REPLAY|";
  payload += "data|";
  payload += std::to_string(controller) + "|";
  payload += std::to_string(location) + "|";

  for (const auto &element : message)
  {
    payload += std::to_string(static_cast<int>(element)) + "|";
  }

  std::cout << payload << std::endl;
}

void AddMessageToReplaySender::sendUpdateCard(uint8_t controller, uint32_t location, uint8_t sequence, std::vector<uint8_t> message)
{
  std::string payload = "CMD:REPLAY|";
  payload += "card|";
  payload += std::to_string(controller) + "|";
  payload += std::to_string(location) + "|";
  payload += std::to_string(sequence) + "|";

  for (const auto &element : message)
  {
    payload += std::to_string(static_cast<int>(element)) + "|";
  }

  std::cout << payload << std::endl;
}

void AddMessageToReplaySender::send(std::vector<uint8_t> message)
{
  std::string payload = "CMD:REPLAY|";
  payload += "message|";

  for (const auto &element : message)
  {
    payload += std::to_string(static_cast<int>(element)) + "|";
  }

  std::cout << payload << std::endl;
}