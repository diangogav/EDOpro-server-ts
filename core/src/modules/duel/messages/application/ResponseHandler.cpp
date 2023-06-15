#include "ResponseHandler.h"

ResponseHandler::ResponseHandler(OCG_Duel duel, OCGRepository repository, uint16_t timeLimit) : duel(duel), repository(repository), timeLimit(timeLimit) {}

void ResponseHandler::handle(uint8_t team, std::vector<uint8_t> message)
{
  repository.setResponse(duel, message);
}