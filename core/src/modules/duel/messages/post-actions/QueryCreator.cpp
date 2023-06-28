#include "QueryCreator.h"

std::vector<QueryRequest> QueryCreator::run(const std::vector<uint8_t> &message)
{
  uint8_t messageType = message[0U];
  auto *ptr = message.data();
  ptr++;
  std::vector<QueryRequest> queryRequests;

  if (messageType == MSG_DRAW || messageType == MSG_SHUFFLE_HAND)
  {
    auto player = Read<uint8_t>(ptr);
    queryRequests.emplace_back(QueryLocationRequest{player, 0x02, 0x3781FFF});
  }

  if (messageType == MSG_SWAP)
  {
    ptr += 4U; // Previous card code
    const auto p = Read<LocInfo>(ptr);
    ptr += 4U; // Current card code
    const auto c = Read<LocInfo>(ptr);
    queryRequests.emplace_back(QuerySingleRequest{p.con, p.loc, p.seq, 0x3F81FFF});
    queryRequests.emplace_back(QuerySingleRequest{c.con, c.loc, c.seq, 0x3F81FFF});
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

  if (messageType == MSG_TAG_SWAP)
  {
    auto player = Read<uint8_t>(ptr);
    queryRequests.reserve(7U);
    queryRequests.emplace_back(QueryLocationRequest{player, LOCATION_DECK, 0x1181FFF});
    queryRequests.emplace_back(QueryLocationRequest{player, LOCATION_EXTRA, 0x381FFF});
    queryRequests.emplace_back(QueryLocationRequest{player, LOCATION_HAND, 0x3781FFF});
    queryRequests.emplace_back(QueryLocationRequest{0U, LOCATION_MZONE, 0x3081FFF});
    queryRequests.emplace_back(QueryLocationRequest{1U, LOCATION_MZONE, 0x3081FFF});
    queryRequests.emplace_back(QueryLocationRequest{0U, LOCATION_SZONE, 0x30681FFF});
    queryRequests.emplace_back(QueryLocationRequest{1U, LOCATION_SZONE, 0x30681FFF});
  }

  if (messageType == MSG_RELOAD_FIELD)
  {
    queryRequests.emplace_back(QueryLocationRequest{0U, LOCATION_EXTRA, 0x381FFF});
    queryRequests.emplace_back(QueryLocationRequest{1U, LOCATION_EXTRA, 0x381FFF});
  }

  return queryRequests;
}