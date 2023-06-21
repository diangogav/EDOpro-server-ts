#include "QuerySerializer.h"

std::vector<uint8_t> QuerySerializer::serialize(const std::optional<Query> &optionalQuery, bool isPublic)
{
  std::vector<uint8_t> queries;
  if (!optionalQuery.has_value()) // Nothing to serialize.
  {
    queries.resize(sizeof(uint16_t), uint8_t{0U});
    return queries;
  }
  const auto &query = optionalQuery.value();
  // Check if a certain query is public or if the whole query object
  // itself is public.
  auto IsPublic = [&query](uint64_t flag) constexpr -> bool
  {
    if ((query.flags & QUERY_IS_PUBLIC) && query.isPublic)
      return true;
    if ((query.flags & QUERY_POSITION) && (query.pos & POS_FACEUP))
      return true;
    switch (flag)
    {
    case QUERY_CODE:
    case QUERY_ALIAS:
    case QUERY_TYPE:
    case QUERY_LEVEL:
    case QUERY_RANK:
    case QUERY_ATTRIBUTE:
    case QUERY_RACE:
    case QUERY_ATTACK:
    case QUERY_DEFENSE:
    case QUERY_BASE_ATTACK:
    case QUERY_BASE_DEFENSE:
    case QUERY_STATUS:
    case QUERY_LSCALE:
    case QUERY_RSCALE:
    case QUERY_LINK:
    {
      return false;
    }
    default:
    {
      return true;
    }
    }
  };
  auto ComputeQuerySize = [&query](uint64_t flag) constexpr -> std::size_t
  {
    switch (flag)
    {
    case QUERY_OWNER:
    case QUERY_IS_PUBLIC:
    case QUERY_IS_HIDDEN:
    {
      return sizeof(uint8_t);
    }
    case QUERY_CODE:
    case QUERY_POSITION:
    case QUERY_ALIAS:
    case QUERY_TYPE:
    case QUERY_LEVEL:
    case QUERY_RANK:
    case QUERY_ATTRIBUTE:
    case QUERY_ATTACK:
    case QUERY_DEFENSE:
    case QUERY_BASE_ATTACK:
    case QUERY_BASE_DEFENSE:
    case QUERY_REASON:
    case QUERY_STATUS:
    case QUERY_LSCALE:
    case QUERY_RSCALE:
    case QUERY_COVER:
    {
      return sizeof(uint32_t);
    }
    case QUERY_RACE:
    {
      return sizeof(uint64_t);
    }
    case QUERY_REASON_CARD:
    case QUERY_EQUIP_CARD:
    {
      return LocInfo::SIZE;
    }
#define X(queryType, var)                                        \
  case queryType:                                                \
  {                                                          \
    return sizeof(uint32_t) +                                \
           (var.size() * sizeof(decltype(var)::value_type)); \
    break;                                                   \
  }
      X(QUERY_TARGET_CARD, query.targets)
      X(QUERY_OVERLAY_CARD, query.overlays)
      X(QUERY_COUNTERS, query.counters)
#undef X
    case QUERY_LINK:
    {
      return sizeof(uint32_t) + sizeof(uint32_t);
    }
    case QUERY_END:
    default:
    {
      return 0U;
    }
    }
  };
  const auto totalQuerySize = [&]() constexpr -> std::size_t
  {
    std::size_t size = 0U;
    for (uint64_t flag = 1U; flag <= QUERY_END; flag <<= 1U)
    {
      if ((query.flags & flag) != flag)
        continue;
      if (flag == QUERY_REASON_CARD && query.reasonCard.loc == 0U)
        continue;
      if (flag == QUERY_EQUIP_CARD && query.equipCard.loc == 0U)
        continue;
      if ((query.flags & QUERY_IS_HIDDEN) && query.isHidden && !IsPublic(flag))
        continue;
      if (isPublic && !IsPublic(flag))
        continue;
      size += sizeof(uint16_t) + sizeof(uint32_t);
      size += ComputeQuerySize(flag);
    }
    return size;
  }();
  queries.resize(totalQuerySize);
  auto Insert = [ptr = queries.data()](auto &&value) mutable
  {
    using Base = std::remove_cv_t<std::remove_reference_t<decltype(value)>>;
    if constexpr (std::is_same_v<Base, LocInfo>)
    {
      Write<uint8_t>(ptr, value.con);
      Write<uint8_t>(ptr, value.loc);
      Write<uint32_t>(ptr, value.seq);
      Write<uint32_t>(ptr, value.pos);
    }
    else
    {
      Write<Base>(ptr, value);
    }
  };
  for (uint64_t flag = 1U; flag <= QUERY_END; flag <<= 1U)
  {
    if ((query.flags & flag) != flag)
      continue;
    if (flag == QUERY_REASON_CARD && query.reasonCard.loc == 0U)
      continue;
    if (flag == QUERY_EQUIP_CARD && query.equipCard.loc == 0U)
      continue;
    if ((query.flags & QUERY_IS_HIDDEN) && query.isHidden && !IsPublic(flag))
      continue;
    if (isPublic && !IsPublic(flag))
      continue;
    Insert(static_cast<uint16_t>(ComputeQuerySize(flag) + sizeof(uint32_t)));
    Insert(static_cast<uint32_t>(flag));
    switch (flag)
    {
#define X(qtype, var) \
  case qtype:         \
  {                   \
    Insert(var);      \
    break;            \
  }
      X(QUERY_CODE, query.code)
      X(QUERY_POSITION, query.pos)
      X(QUERY_ALIAS, query.alias)
      X(QUERY_TYPE, query.type)
      X(QUERY_LEVEL, query.level)
      X(QUERY_RANK, query.rank)
      X(QUERY_ATTRIBUTE, query.attribute)
      X(QUERY_RACE, query.race)
      X(QUERY_ATTACK, query.attack)
      X(QUERY_DEFENSE, query.defense)
      X(QUERY_BASE_ATTACK, query.bAttack)
      X(QUERY_BASE_DEFENSE, query.bDefense)
      X(QUERY_REASON, query.reason)
      X(QUERY_OWNER, query.owner)
      X(QUERY_STATUS, query.status)
      X(QUERY_IS_PUBLIC, query.isPublic)
      X(QUERY_LSCALE, query.lscale)
      X(QUERY_RSCALE, query.rscale)
      X(QUERY_REASON_CARD, query.reasonCard)
      X(QUERY_EQUIP_CARD, query.equipCard)
      X(QUERY_IS_HIDDEN, query.isHidden)
      X(QUERY_COVER, query.cover)
#undef X
#define X(qtype, var)                          \
  case qtype:                                  \
  {                                            \
    Insert(static_cast<uint16_t>(var.size())); \
    for (const auto &elem : var)               \
      Insert(elem);                            \
    break;                                     \
  }
      X(QUERY_TARGET_CARD, query.targets)
      X(QUERY_OVERLAY_CARD, query.overlays)
      X(QUERY_COUNTERS, query.counters)
#undef X
    case QUERY_LINK:
    {
      Insert(query.link);
      Insert(query.linkMarker);
      break;
    }
    default:
      break;
    }
  }
  return queries;
}

std::vector<uint8_t> QuerySerializer::serializeLocationQuery(const std::vector<std::optional<Query>> &queries, bool isPublic)
{
  uint32_t totalSize = 0U;
  std::vector<uint8_t> serializedQueries(sizeof(decltype(totalSize)));
  for (const auto &query : queries)
  {
    const auto serializedQuery = serialize(query, isPublic);
    totalSize += static_cast<uint32_t>(serializedQuery.size());
    serializedQueries.insert(serializedQueries.end(), serializedQuery.begin(), serializedQuery.end());
  }
  std::memcpy(serializedQueries.data(), &totalSize, sizeof(decltype(totalSize)));
  return serializedQueries;
}