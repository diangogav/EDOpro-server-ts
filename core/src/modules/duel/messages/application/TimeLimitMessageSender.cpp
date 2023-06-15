#include "TimeLimitMessageSender.h"

void TimeLimitMessageSender::send(uint8_t team, uint16_t timeLeft)
{
  std::string payload = "CMD:TIME|";
  payload += std::to_string(team) + "|";
  payload += std::to_string(timeLeft) + "|";
  std::cout << payload << std::endl;
}