#ifndef QUERY_REQUEST_PROCESSOR
#define QUERY_REQUEST_PROCESSOR

#include "vector"
#include "../../../shared/QueryRequest.h"
#include "../../../../ocgapi_types.h"
#include "../../infrastructure/OCGRepository.h"
#include "../domain/LocationQueryDeserializer.h"
#include "../domain/LocationQuerySerializer.h"

class QueryRequestProcessor {
private:
  OCGRepository repository;
  LocationQueryDeserializer deserializer;
  LocationQuerySerializer serializer;

public:
  QueryRequestProcessor(OCGRepository repository);
  void run(const std::vector<QueryRequest>& queryRequests, OCG_Duel duel);
};

#endif