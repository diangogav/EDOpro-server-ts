#ifndef DUEL_FINISHED_MESSAGE_SENDER
#define DUEL_FINISHED_MESSAGE_SENDER

#include <vector>
#include <iostream>

class DuelFinishedMessageSender
{
public:
  void send(uint8_t reason, uint8_t winner);
};

#endif