#include "ResponseHandler.h"

ResponseHandler::ResponseHandler(OCG_Duel duel, OCGRepository repository, uint16_t timeLimit) : duel(duel), repository(repository), timeLimit(timeLimit) {
  DuelTimeRemainingCalculator timeCalculator;
}

void ResponseHandler::handle(uint8_t team, std::vector<uint8_t> message)
{
  timeCalculator.reduce(team);
  repository.setResponse(duel, message);
}