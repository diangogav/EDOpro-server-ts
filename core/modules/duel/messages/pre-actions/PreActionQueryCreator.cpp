#include "PreActionQueryCreator.h"

std::vector<QueryRequest> PreActionQueryCreator::run(const std::vector<uint8_t> &message)
{
  uint8_t messageType = message[0U];
  std::vector<QueryRequest> queryRequests;
  // printf("message type in pre actions\n");
  // printf("%x", messageType);
  // printf("\n");
  if (messageType == MSG_NEW_TURN || messageType == MSG_SELECT_CHAIN)
  {
    ZonesRefresher::refreshAllMZones(queryRequests);
    ZonesRefresher::refreshAllSZones(queryRequests);
  }

  return queryRequests;
}
