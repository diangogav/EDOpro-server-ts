#include "DuelFinishedMessageSender.h"

void DuelFinishedMessageSender::send(uint8_t reason, uint8_t winner)
{
  std::string payload = "CMD:FINISH|";
  payload += std::to_string(static_cast<int>(reason)) + "|";
  payload += std::to_string(static_cast<int>(winner)) + "|";
  std::cout << payload << std::endl;
}
