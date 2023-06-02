#include "WaitingMessageSender.h"

void WaitingMessageSender::send(uint8_t team)
{
  std::string payload = "CMD:WAITING|";
  payload += std::to_string(team) + "|";
  std::cout << payload << std::endl;
}