#include "PostActions.h"

PostActions::PostActions(uint16_t timeLimitsInSeconds, uint8_t isTeam1GoingFirst) : timeLimitsInSeconds(timeLimitsInSeconds), isTeam1GoingFirst(isTeam1GoingFirst) {}

void PostActions::run(std::vector<uint8_t> message)
{
  uint8_t messageType = message[0U];

  if (DoesMessageRequireAnswer(messageType))
  {
    if (timeLimitsInSeconds != 0U)
    {
      uint8_t team = calculateTeam(message[1U]);
      DuelTimeRemainingCalculator duelTimeRemainingCalculator;
      uint16_t ticks = duelTimeRemainingCalculator.calculate(team);
      TimeLimitMessageSender sender;
      sender.send(team, ticks);
    }
  }
}

uint8_t PostActions::calculateTeam(uint8_t team)
{
  assert(team <= 1U);
  return isTeam1GoingFirst ^ team;
}

bool PostActions::DoesMessageRequireAnswer(uint8_t messageType)
{
  switch (messageType)
  {
  // case MSG_SELECT_CARD:
  // case MSG_SELECT_TRIBUTE:
  // case MSG_SELECT_UNSELECT_CARD:
  // case MSG_SELECT_BATTLECMD:
  // case MSG_SELECT_IDLECMD:
  // case MSG_SELECT_EFFECTYN:
  // case MSG_SELECT_YESNO:
  // case MSG_SELECT_OPTION:
  case MSG_SELECT_CHAIN:
    // case MSG_SELECT_PLACE:
    // case MSG_SELECT_DISFIELD:
    // case MSG_SELECT_POSITION:
    // case MSG_SORT_CARD:
    // case MSG_SORT_CHAIN:
    // case MSG_SELECT_COUNTER:
    // case MSG_SELECT_SUM:
    // case MSG_ROCK_PAPER_SCISSORS:
    // case MSG_ANNOUNCE_RACE:
    // case MSG_ANNOUNCE_ATTRIB:
    // case MSG_ANNOUNCE_CARD:
    // case MSG_ANNOUNCE_NUMBER:
    // case MSG_ANNOUNCE_CARD_FILTER:
    {
      return true;
    }
  default:
  {
    return false;
  }
  }
}