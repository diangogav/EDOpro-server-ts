#include "NewTurnMessageSender.h"

void NewTurnMessageSender::send()
{
  std::string payload = "CMD:TURN|";
  std::cout << payload << std::endl;
}
