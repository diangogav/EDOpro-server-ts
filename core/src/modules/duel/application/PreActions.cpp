#include "PreActions.h"

PreActions::PreActions(uint16_t timeLimitsInSeconds, uint8_t isTeam1GoingFirst) : timeLimitsInSeconds(timeLimitsInSeconds), isTeam1GoingFirst(isTeam1GoingFirst) {}

void PreActions::run(std::vector<uint8_t> message)
{
  uint8_t messageType = message[0U];

  if (messageType == MSG_NEW_TURN)
  {
    DuelTurnTimer &timer = DuelTurnTimer::getInstance();
    timer.resetTimers(timeLimitsInSeconds);
  }

  if (messageType == MSG_HINT && message[1U] == 3U)
  {
    //set Last hint
  }

  if (DoesMessageRequireAnswer(messageType))
  {
    uint8_t team = this->calculateTeam(this->getMessageReceivingTeam(message));
    Replier::getInstance().set(team);
  }
}

uint8_t PreActions::calculateTeam(uint8_t team)
{
  assert(team <= 1U);
  return isTeam1GoingFirst ^ team;
}

uint8_t PreActions::getMessageReceivingTeam(std::vector<uint8_t> message)
{
  if (message[0] == MSG_HINT)
  {
    return message[2U];
  }

  return message[1U];
}

bool PreActions::DoesMessageRequireAnswer(uint8_t messageType)
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