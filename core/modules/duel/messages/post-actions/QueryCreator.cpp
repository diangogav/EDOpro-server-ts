#include "QueryCreator.h"

std::vector<QueryRequest> QueryCreator::run(const std::vector<uint8_t> &message)
{
  uint8_t messageType = message[0U];
  auto *ptr = message.data();
  ptr++;
  std::vector<QueryRequest> queryRequests;

  if (messageType == MSG_DRAW)
  {
    auto player = Read<uint8_t>(ptr);
    queryRequests.emplace_back(QueryLocationRequest{player, 0x02, 0x3781FFF});
  }

  if(messageType == MSG_NEW_PHASE)
  {
    ZonesRefresher::refreshAllMZones(queryRequests);
    ZonesRefresher::refreshAllSZones(queryRequests);
    ZonesRefresher::refreshAllHands(queryRequests);
  }

  return queryRequests;
}