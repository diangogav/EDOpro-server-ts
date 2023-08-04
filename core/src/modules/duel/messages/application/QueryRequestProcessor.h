#ifndef QUERY_REQUEST_PROCESSOR
#define QUERY_REQUEST_PROCESSOR

#include "vector"
#include "assert.h"
#include "../../../shared/QueryRequest.h"
#include "../../../shared/DuelLocations.h"
#include "../../../shared/ocgapi_types.h"
#include "../../infrastructure/OCGRepository.h"
#include "../domain/QueryDeserializer.h"
#include "../domain/QuerySerializer.h"
#include "BufferMessageSender.h"
#include "UpdateCardMessageSender.h"
#include "AddMessageToReplaySender.h"


class QueryRequestProcessor {
private:
  uint8_t isTeam1GoingFirst;
  OCGRepository repository;
  QueryDeserializer deserializer;
  QuerySerializer serializer;
  BufferMessageSender bufferMessageSender;
  uint8_t calculateTeam(uint8_t team);
  UpdateCardMessageSender updateCardMessageSender;
  AddMessageToReplaySender addMessageToReplay;

public:
  QueryRequestProcessor(OCGRepository repository, uint8_t isTeam1GoingFirst);
  void run(const std::vector<QueryRequest>& queryRequests, OCG_Duel duel);
};

#endif