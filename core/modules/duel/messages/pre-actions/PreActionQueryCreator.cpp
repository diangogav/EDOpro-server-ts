#include "PreActionQueryCreator.h"

std::vector<QueryRequest> PreActionQueryCreator::run(const std::vector<uint8_t> &message)
{
  uint8_t messageType = message[0U];
  std::vector<QueryRequest> queryRequests;
  // printf("message type in pre actions\n");
  // printf("%x", messageType);
  // printf("\n");
  if (messageType == MSG_NEW_TURN)
  {
    printf("entre a new turn\n");
    /* AddRefreshAllMZones */
    queryRequests.emplace_back(QueryLocationRequest{0U, LOCATION_MZONE, 0x3881FFF});
    queryRequests.emplace_back(QueryLocationRequest{1U, LOCATION_MZONE, 0x3881FFF});

    /* AddRefreshAllMZones */
    queryRequests.emplace_back(QueryLocationRequest{0U, LOCATION_SZONE, 0x3E81FFF});
    queryRequests.emplace_back(QueryLocationRequest{1U, LOCATION_SZONE, 0x3E81FFF});
  }

  return queryRequests;
}
