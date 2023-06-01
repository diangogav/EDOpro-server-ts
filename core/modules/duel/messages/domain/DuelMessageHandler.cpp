#include "DuelMessageHandler.h"
#include "../application/DrawCardHandler.h"
#include "../application/DuelMessageSender.h"

DuelMessageHandler::DuelMessageHandler(uint16_t isTeam1GoingFirst) : isTeam1GoingFirst(isTeam1GoingFirst) {}
void DuelMessageHandler::handle(std::vector<uint8_t> message)
{
  uint8_t messageType = message[0U];
  if (messageType == MSG_DRAW)
  {
    DuelMessageSender sender;
    DrawCardHandler handler;
    uint8_t teamA = this->calculateTeam(0U);
    uint8_t teamB = this->calculateTeam(1U);
    sender.send(teamA, handler.handle(teamA, message));
    sender.send(teamB, handler.handle(teamB, message));
  }
  if(messageType == MSG_NEW_TURN) {
    
  }
}

uint8_t DuelMessageHandler::calculateTeam(uint8_t team)
{
  assert(team <= 1U);
  return isTeam1GoingFirst ^ team;
}
