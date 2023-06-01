#ifndef QUERY_REQUEST_PROCESSOR
#define QUERY_REQUEST_PROCESSOR

#include "vector"
#include "assert.h"
#include "../../../shared/QueryRequest.h"
#include "../../../shared/DuelLocations.h"
#include "../../../../ocgapi_types.h"
#include "../../infrastructure/OCGRepository.h"
#include "../domain/LocationQueryDeserializer.h"
#include "../domain/LocationQuerySerializer.h"
#include "BufferMessageSender.h"


class QueryRequestProcessor {
private:
  uint8_t isTeam1GoingFirst;
  OCGRepository repository;
  LocationQueryDeserializer deserializer;
  LocationQuerySerializer serializer;
  BufferMessageSender bufferMessageSender;
  uint8_t calculateTeam(uint8_t team);

public:
  QueryRequestProcessor(OCGRepository repository, uint8_t isTeam1GoingFirst);
  void run(const std::vector<QueryRequest>& queryRequests, OCG_Duel duel);
};

#endif