#include "DuelMessageHandler.h"
#include "../application/DuelMessageSender.h"
#include "../application/WaitingMessageSender.h"
#include "../../../shared/DuelTurnTimer.h"
#include "../../../shared/DuelLocations.h"
#include "../../../shared/QueryRequest.h"

template <>
constexpr LocInfo Read(const uint8_t *&ptr) noexcept
{
  return LocInfo{
      Read<uint8_t>(ptr),
      Read<uint8_t>(ptr),
      Read<uint32_t>(ptr),
      Read<uint32_t>(ptr)};
}

DuelMessageHandler::DuelMessageHandler(uint8_t isTeam1GoingFirst, uint16_t timeLimitsInSeconds) : isTeam1GoingFirst(isTeam1GoingFirst), timeLimitsInSeconds(timeLimitsInSeconds)
{
  BroadcastMessageSender sender;
  DrawCardHandler handler;
}

void DuelMessageHandler::handle(std::vector<uint8_t> message)
{
  DuelMessageSender messageSender;
  switch (this->getMessageTarget(message))
  {
  case MessageTargets::MSG_DIST_TYPE_SPECIFIC_TEAM_DUELIST_STRIPPED:
  {
    uint8_t team = this->getTeamMessageReceptor(message);
    messageSender.send(this->calculateTeam(team), handler.handle(team, message));
    break;
  }
  case MessageTargets::MSG_DIST_TYPE_EVERYONE_STRIPPED:
  {
    uint8_t teamA = this->calculateTeam(0U);
    uint8_t teamB = this->calculateTeam(1U);
    messageSender.send(teamA, handler.handle(0U, message));
    messageSender.send(teamB, handler.handle(1U, message));
    break;
  }
  case MessageTargets::MSG_DIST_TYPE_EVERYONE:
  {
    sender.send(message);
    break;
  }
  case MessageTargets::MSG_DIST_TYPE_SPECIFIC_TEAM_DUELIST:
  {
    uint8_t team = this->getTeamMessageReceptor(message);
    messageSender.send(calculateTeam(team), message);
    break;
  }
  }
}

MessageTargets DuelMessageHandler::getMessageTarget(const std::vector<uint8_t> &msg) noexcept
{
  switch (msg[0U])
  {
  case MSG_SELECT_CARD:
  case MSG_SELECT_TRIBUTE:
  case MSG_SELECT_UNSELECT_CARD:
  {
    return MessageTargets::MSG_DIST_TYPE_SPECIFIC_TEAM_DUELIST_STRIPPED;
  }
  case MSG_SELECT_BATTLECMD:
  case MSG_SELECT_IDLECMD:
  case MSG_SELECT_EFFECTYN:
  case MSG_SELECT_YESNO:
  case MSG_SELECT_OPTION:
  case MSG_SELECT_CHAIN:
  case MSG_SELECT_PLACE:
  case MSG_SELECT_DISFIELD:
  case MSG_SELECT_POSITION:
  case MSG_SORT_CARD:
  case MSG_SORT_CHAIN:
  case MSG_SELECT_COUNTER:
  case MSG_SELECT_SUM:
  case MSG_ROCK_PAPER_SCISSORS:
  case MSG_ANNOUNCE_RACE:
  case MSG_ANNOUNCE_ATTRIB:
  case MSG_ANNOUNCE_CARD:
  case MSG_ANNOUNCE_NUMBER:
  case MSG_ANNOUNCE_CARD_FILTER:
  case MSG_MISSED_EFFECT:
  {
    return MessageTargets::MSG_DIST_TYPE_SPECIFIC_TEAM_DUELIST;
  }
  case MSG_HINT:
  {
    switch (msg[1U])
    {
    case 1U:
    case 2U:
    case 3U:
    case 5U:
    {
      return MessageTargets::MSG_DIST_TYPE_SPECIFIC_TEAM_DUELIST;
    }
    case 200U:
    {
      return MessageTargets::MSG_DIST_TYPE_SPECIFIC_TEAM;
    }
    case 4U:
    case 6U:
    case 7U:
    case 8U:
    case 9U:
    case 11U:
    {
      return MessageTargets::MSG_DIST_TYPE_EVERYONE_EXCEPT_TEAM_DUELIST;
    }
    default: /*case 10U: case 201U: case 202U: case 203U:*/
    {
      return MessageTargets::MSG_DIST_TYPE_EVERYONE;
    }
    }
  }
  case MSG_CONFIRM_CARDS:
  {
    const auto *ptr = msg.data() + 2U;
    // if count(uint32_t) is not 0 and location(uint8_t) is LOCATION_DECK
    // then send to specific team duelist.
    if (Read<uint32_t>(ptr) != 0U)
    {
      ptr += 4U + 1U;
      if (Read<uint8_t>(ptr) == LOCATION_DECK)
        return MessageTargets::MSG_DIST_TYPE_SPECIFIC_TEAM_DUELIST;
    }
    return MessageTargets::MSG_DIST_TYPE_EVERYONE;
  }
  case MSG_SHUFFLE_HAND:
  case MSG_SHUFFLE_EXTRA:
  case MSG_SET:
  case MSG_MOVE:
  case MSG_DRAW:
  case MSG_TAG_SWAP:
  {
    return MessageTargets::MSG_DIST_TYPE_EVERYONE_STRIPPED;
  }
  default:
  {
    return MessageTargets::MSG_DIST_TYPE_EVERYONE;
  }
  }
}

uint8_t DuelMessageHandler::calculateTeam(uint8_t team)
{
  assert(team <= 1U);
  return isTeam1GoingFirst ^ team;
}

uint8_t DuelMessageHandler::getTeamMessageReceptor(const std::vector<uint8_t> &msg) noexcept
{
  switch (msg[0U])
  {
  case MSG_HINT:
  {
    return msg[2U];
  }
  default:
  {
    return msg[1U];
  }
  }
}