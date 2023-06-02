#include "DuelMessageHandler.h"
#include "../application/DrawCardHandler.h"
#include "../application/DuelMessageSender.h"
#include "../application/BroadcastMessageSender.h"
#include "../application/WaitingMessageSender.h"

DuelMessageHandler::DuelMessageHandler(uint16_t isTeam1GoingFirst) : isTeam1GoingFirst(isTeam1GoingFirst) {}
void DuelMessageHandler::handle(std::vector<uint8_t> message)
{
  uint8_t messageType = message[0U];
  DuelMessageSender messageSender;
  if (messageType == MSG_DRAW)
  {
    DrawCardHandler handler;
    uint8_t teamA = this->calculateTeam(0U);
    uint8_t teamB = this->calculateTeam(1U);
    messageSender.send(teamA, handler.handle(teamA, message));
    messageSender.send(teamB, handler.handle(teamB, message));
  }
  if (messageType == MSG_NEW_TURN)
  {
    BroadcastMessageSender sender;
    sender.send(message);
  }
  if (messageType == MSG_NEW_PHASE)
  {
    BroadcastMessageSender sender;
    sender.send(message);
  }
  if (messageType == MSG_HINT)
  {
    uint8_t team = message[2U];
    messageSender.send(calculateTeam(team), message);
  }
  if (messageType == MSG_SELECT_CHAIN)
  {
    WaitingMessageSender sender;
    uint8_t team = calculateTeam(message[1U]);
    messageSender.send(team, message);
    sender.send(team);
  }
}

uint8_t DuelMessageHandler::calculateTeam(uint8_t team)
{
  assert(team <= 1U);
  return isTeam1GoingFirst ^ team;
}
