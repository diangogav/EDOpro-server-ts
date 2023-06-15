#include "LocationQueryDeserializer.h"

inline std::optional<Query> DeserializeOneQuery(const uint8_t *&pointer) noexcept
{
  if (Read<uint16_t>(pointer) == 0U)
    return std::nullopt;
  pointer -= sizeof(uint16_t);
  for (std::optional<Query> query = Query{};;)
  {
    auto size = Read<uint16_t>(pointer);
    auto flag = Read<uint32_t>(pointer);
    query->flags |= flag;
    switch (flag)
    {
#define X(queryType, var)               \
  case queryType:                       \
  {                                     \
    var = Read<decltype(var)>(pointer); \
    break;                              \
  }
      X(QUERY_CODE, query->code)
      X(QUERY_POSITION, query->pos)
      X(QUERY_ALIAS, query->alias)
      X(QUERY_TYPE, query->type)
      X(QUERY_LEVEL, query->level)
      X(QUERY_RANK, query->rank)
      X(QUERY_ATTRIBUTE, query->attribute)
      X(QUERY_RACE, query->race)
      X(QUERY_ATTACK, query->attack)
      X(QUERY_DEFENSE, query->defense)
      X(QUERY_BASE_ATTACK, query->bAttack)
      X(QUERY_BASE_DEFENSE, query->bDefense)
      X(QUERY_REASON, query->reason)
      X(QUERY_OWNER, query->owner)
      X(QUERY_STATUS, query->status)
      X(QUERY_IS_PUBLIC, query->isPublic)
      X(QUERY_LSCALE, query->lscale)
      X(QUERY_RSCALE, query->rscale)
      X(QUERY_REASON_CARD, query->reasonCard)
      X(QUERY_EQUIP_CARD, query->equipCard)
      X(QUERY_IS_HIDDEN, query->isHidden)
      X(QUERY_COVER, query->cover)
#undef X
#define X(queryType, var)                                      \
  case queryType:                                              \
  {                                                            \
    auto c = Read<uint32_t>(pointer);                          \
    for (uint32_t i = 0U; i < c; i++)                          \
      var.push_back(Read<decltype(var)::value_type>(pointer)); \
    break;                                                     \
  }
      X(QUERY_TARGET_CARD, query->targets)
      X(QUERY_OVERLAY_CARD, query->overlays)
      X(QUERY_COUNTERS, query->counters)
#undef X
    case QUERY_LINK:
    {
      query->link = Read<uint32_t>(pointer);
      query->linkMarker = Read<uint32_t>(pointer);
      break;
    }
    case QUERY_END:
    {
      return query;
    }
    default:
    {
      pointer += size - sizeof(uint32_t);
      break;
    }
    }
  }
}

std::vector<std::optional<Query>> LocationQueryDeserializer::deserialize(const std::vector<uint8_t> &queries)
{
  const auto *pointer = queries.data();
  const auto *const pointerMax = pointer + Read<uint32_t>(pointer);
  std::vector<std::optional<Query>> deserializedQueries;
  while (pointer < pointerMax)
    deserializedQueries.emplace_back(DeserializeOneQuery(pointer));
  return deserializedQueries;
}