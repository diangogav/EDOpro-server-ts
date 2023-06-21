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

  if (messageType == MSG_NEW_PHASE || messageType == MSG_CHAINED)
  {
    ZonesRefresher::refreshAllMZones(queryRequests);
    ZonesRefresher::refreshAllSZones(queryRequests);
    ZonesRefresher::refreshAllHands(queryRequests);
  }

  if (messageType == MSG_SPSUMMONED || messageType == MSG_SUMMONED || messageType == MSG_FLIPSUMMONED)
  {
    ZonesRefresher::refreshAllMZones(queryRequests);
    ZonesRefresher::refreshAllSZones(queryRequests);
  }

  if (messageType == MSG_DAMAGE_STEP_START || messageType == MSG_DAMAGE_STEP_END)
  {
    ZonesRefresher::refreshAllMZones(queryRequests);
  }

  if (messageType == MSG_CHAIN_END)
  {
    ZonesRefresher::refreshAllDecks(queryRequests);
    ZonesRefresher::refreshAllMZones(queryRequests);
    ZonesRefresher::refreshAllSZones(queryRequests);
    ZonesRefresher::refreshAllHands(queryRequests);
  }

  if (messageType == MSG_MOVE)
  {
    ptr += 4U; // Card code
    const auto previous = Read<LocInfo>(ptr);
    const auto current = Read<LocInfo>(ptr);
    if ((previous.con != current.con || previous.loc != current.loc) &&
        current.loc != 0U && (current.loc & LOCATION_OVERLAY) == 0U)
    {
      queryRequests.emplace_back(QuerySingleRequest{
          current.con,
          current.loc,
          current.seq,
          0x3F81FFF});
    }
  }

  return queryRequests;
}