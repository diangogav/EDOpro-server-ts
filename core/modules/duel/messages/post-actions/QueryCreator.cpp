#include "QueryCreator.h"

std::vector<QueryRequest> QueryCreator::run(std::vector<uint8_t> &message)
{
  auto *ptr = message.data();
  ptr++;
  std::vector<QueryRequest> queryRequests;

  auto player = Read<uint8_t>(ptr);
  queryRequests.emplace_back(QueryLocationRequest{player, 0x02, 0x3781FFF});

  return queryRequests;
}