#include "DuelFinishHandler.h"

DuelFinishHandler::DuelFinishHandler(uint8_t isTeam1GoingFirst) : isTeam1GoingFirst(isTeam1GoingFirst)
{
  DuelFinishedMessageSender sender;
}

bool DuelFinishHandler::handle(std::vector<uint8_t> message)
{
  if (message[0U] != MSG_WIN)
  {
    return false;
  }

  uint8_t winner = (message[1U] > 1U) ? 2U : this->calculateTeam(message[1U]);
  sender.send(0, winner);
  return true;
}

uint8_t DuelFinishHandler::calculateTeam(uint8_t team)
{
  assert(team <= 1U);
  return isTeam1GoingFirst ^ team;
}