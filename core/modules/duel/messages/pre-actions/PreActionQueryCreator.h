#ifndef PRE_ACTION_QUERY_CREATOR
#define PRE_ACTION_QUERY_CREATOR

#include <vector>
#include "iostream"
#include "../../../shared/QueryRequest.h"
#include "../../../shared/DuelStages.h"
#include "../../../shared/DuelLocations.h"
#include "../../../shared/ZonesRefresher.h"

class PreActionQueryCreator {
public:
  std::vector<QueryRequest> run(const std::vector<uint8_t>& message);
};

#endif