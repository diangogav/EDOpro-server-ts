#include "LogMessageSender.h"

void LogMessageSender::send(std::vector<uint8_t> message)
{
  std::string payload = "CMD:LOG|";
  for (const auto &element : message)
  {
    payload += std::to_string(static_cast<int>(element)) + "|";
  }
  std::cout << payload << std::endl;
}
