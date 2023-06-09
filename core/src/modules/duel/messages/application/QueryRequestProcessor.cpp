#include "QueryRequestProcessor.h"

QueryRequestProcessor::QueryRequestProcessor(OCGRepository repository, uint8_t isTeam1GoingFirst) : repository(repository), isTeam1GoingFirst(isTeam1GoingFirst) {
  LocationQueryDeserializer deserializer;
  LocationQuerySerializer serializer;
  BufferMessageSender bufferMessageSender;
}

void QueryRequestProcessor::run(const std::vector<QueryRequest>& queryRequests, OCG_Duel duel) {
  for(const auto& queryRequest : queryRequests) {
    if(std::holds_alternative<QuerySingleRequest>(queryRequest)) {

    } else {
      const auto& queryLocationRequest = std::get<QueryLocationRequest>(queryRequest);
      OCG_QueryInfo query = {
        queryLocationRequest.flags,
        queryLocationRequest.con,
        queryLocationRequest.loc,
        0U,
        0U
      };

      uint8_t team = this->calculateTeam(queryLocationRequest.con);
      const auto buffer = repository.duelQueryLocation(duel, query);

      if(queryLocationRequest.loc == LOCATION_DECK) {
        continue;
      }

      if(queryLocationRequest.loc == LOCATION_EXTRA) {
        bufferMessageSender.send(team, queryLocationRequest.loc, queryLocationRequest.con, buffer);
        continue;
      }

      const auto queries = deserializer.deserialize(buffer);
      const auto playerBuffer = serializer.serialize(queries, false);
      const auto strippedBuffer = serializer.serialize(queries, true);

      bufferMessageSender.send(team, queryLocationRequest.loc, queryLocationRequest.con, playerBuffer);
      bufferMessageSender.send(1U - team, queryLocationRequest.loc, queryLocationRequest.con, strippedBuffer);

    }
  }
}

uint8_t QueryRequestProcessor::calculateTeam(uint8_t team)
{
	assert(team <= 1U);
	return isTeam1GoingFirst ^ team;
}

