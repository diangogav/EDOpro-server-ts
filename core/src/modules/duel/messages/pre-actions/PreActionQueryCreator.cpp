#include "PreActionQueryCreator.h"
#include "../../../shared/Read.h"
template <>
constexpr LocInfo Read(const uint8_t *&ptr) noexcept
{
  return LocInfo{
      Read<uint8_t>(ptr),
      Read<uint8_t>(ptr),
      Read<uint32_t>(ptr),
      Read<uint32_t>(ptr)};
}

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

  if (messageType == MSG_SELECT_IDLECMD || messageType == MSG_SELECT_BATTLECMD)
  {
    ZonesRefresher::refreshAllHands(queryRequests);
    ZonesRefresher::refreshAllMZones(queryRequests);
    ZonesRefresher::refreshAllSZones(queryRequests);
  }

  if (messageType == MSG_FLIPSUMMONING)
  {
    const auto *ptr = message.data();
    ptr++;     // type ignored
    ptr += 4U; // Card code
    const auto i = Read<LocInfo>(ptr);
    queryRequests.emplace_back(QuerySingleRequest{i.con, i.loc, i.seq, 0x3F81FFF});
  }

  return queryRequests;
}
