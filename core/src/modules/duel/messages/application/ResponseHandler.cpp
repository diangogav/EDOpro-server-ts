#include "ResponseHandler.h"

ResponseHandler::ResponseHandler(OCG_Duel duel, OCGRepository repository, uint16_t timeLimit) : duel(duel), repository(repository), timeLimit(timeLimit) {}

void ResponseHandler::handle(uint8_t team, std::vector<uint8_t> message)
{
  if (team != Replier::getInstance().id)
  {
    return;
  }

  if (this->timeLimit != 0U)
  {
    DuelTurnTimer &timer = DuelTurnTimer::getInstance();

    using namespace std::chrono;

    auto delta = timer.expiry(team) - std::chrono::system_clock::now();
    timer.timeRemaining[team] = duration_cast<milliseconds>(ceil<seconds>(delta));
    timer.cancel(team);
  }
  repository.setResponse(duel, message);
}