#include "QueryRequestProcessor.h"

QueryRequestProcessor::QueryRequestProcessor(OCGRepository repository) : repository(repository) {
  LocationQueryDeserializer deserializer;
}

void QueryRequestProcessor::run(const std::vector<QueryRequest>& queryRequests, OCG_Duel duel) {
  for(const auto& queryRequest : queryRequests) {
    if(std::holds_alternative<QuerySingleRequest>(queryRequest)) {

    } else {
      const auto& queryLocationRequest = std::get<QueryLocationRequest>(queryRequest);
      OCG_QueryInfo queryInfo = {
        queryLocationRequest.flags,
        queryLocationRequest.con,
        queryLocationRequest.loc,
        0U,
        0U
      };

      uint8_t team = 0;
      const auto buffer = repository.duelQueryLocation(duel, team);
      const auto queries = deserializer.deserialize(buffer);

    }
  }
}