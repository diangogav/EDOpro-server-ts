#include "PostActions.h"
#include "../messages/application/WaitingMessageSender.h"

PostActions::PostActions(uint16_t timeLimitsInSeconds, uint8_t isTeam1GoingFirst) : timeLimitsInSeconds(timeLimitsInSeconds), isTeam1GoingFirst(isTeam1GoingFirst) {}

void PostActions::run(std::vector<uint8_t> message)
{
  uint8_t messageType = message[0U];

  if (DoesMessageRequireAnswer(messageType))
  {
    WaitingMessageSender waitingMessageSender;
    waitingMessageSender.send(Replier::getInstance().id);

    if (timeLimitsInSeconds != 0U)
    {
      uint8_t team = calculateTeam(this->getTeamMessageReceptor(message));
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

uint8_t PostActions::getTeamMessageReceptor(const std::vector<uint8_t>& msg) noexcept
{
	switch(msg[0U])
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

bool PostActions::DoesMessageRequireAnswer(uint8_t messageType)
{
  switch (messageType)
  {
  // case MSG_SELECT_CARD:
  // case MSG_SELECT_TRIBUTE:
  // case MSG_SELECT_UNSELECT_CARD:
  // case MSG_SELECT_BATTLECMD:
  case MSG_SELECT_IDLECMD:
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