#include "ZonesRefresher.h"

void ZonesRefresher::refreshAllMZones(std::vector<QueryRequest> &queryRequests)
{
  queryRequests.emplace_back(QueryLocationRequest{0U, LOCATION_MZONE, 0x3881FFF});
  queryRequests.emplace_back(QueryLocationRequest{1U, LOCATION_MZONE, 0x3881FFF});
}

void ZonesRefresher::refreshAllSZones(std::vector<QueryRequest> &queryRequests)
{
  queryRequests.emplace_back(QueryLocationRequest{0U, LOCATION_SZONE, 0x3E81FFF});
  queryRequests.emplace_back(QueryLocationRequest{1U, LOCATION_SZONE, 0x3E81FFF});
}

void ZonesRefresher::refreshAllHands(std::vector<QueryRequest> &queryRequests)
{
	queryRequests.emplace_back(QueryLocationRequest{0U, LOCATION_HAND, 0x3781FFF});
	queryRequests.emplace_back(QueryLocationRequest{1U, LOCATION_HAND, 0x3781FFF});
}

void ZonesRefresher::refreshAllDecks(std::vector<QueryRequest> &queryRequests)
{
	queryRequests.emplace_back(QueryLocationRequest{0U, LOCATION_DECK, 0x1181FFF});
	queryRequests.emplace_back(QueryLocationRequest{1U, LOCATION_DECK, 0x1181FFF});
}