#include "DrawCardHandler.h"
#include "../../../shared/DuelStages.h"
#include "../../../shared/DuelLocations.h"
#include "../../../shared/QueryRequest.h"

template <>
constexpr LocInfo Read(const uint8_t *&ptr) noexcept
{
  return LocInfo{
      Read<uint8_t>(ptr),
      Read<uint8_t>(ptr),
      Read<uint32_t>(ptr),
      Read<uint32_t>(ptr)};
}

std::vector<uint8_t> DrawCardHandler::handle(uint8_t team, std::vector<uint8_t> message)
{

  auto IsLocInfoPublic = [](const LocInfo &info)
  {
    if (info.loc & (LOCATION_GRAVE | LOCATION_OVERLAY) &&
        !(info.loc & (LOCATION_DECK | LOCATION_HAND)))
      return true;
    if (!(info.pos & POS_FACEDOWN))
      return true;
    return false;
  };
  auto ClearLocInfoArray = [](uint32_t count, uint8_t team, uint8_t *&ptr)
  {
    for (uint32_t i = 0U; i < count; i++)
    {
      ptr += 4U; // Card code
      const auto info = Read<LocInfo>(ptr);
      if (team != info.con)
      {
        ptr -= LocInfo::SIZE + 4U;
        Write<uint32_t>(ptr, 0U);
        ptr += LocInfo::SIZE;
      }
    }
  };

  auto *ptr = message.data();
  ptr++; // type ignored

  if (message[0U] == MSG_SET)
  {
    Write<uint32_t>(ptr, 0U);
  }

  if (message[0U] == MSG_SHUFFLE_HAND || message[0U] == MSG_SHUFFLE_EXTRA)
  {
    if (Read<uint8_t>(ptr) != team)
    {
      auto count = Read<uint32_t>(ptr);
      for (uint32_t i = 0U; i < count; i++)
        Write<uint32_t>(ptr, 0U);
    }
  }

  if (message[0U] == MSG_DRAW)
  {
    if (Read<uint8_t>(ptr) == team)
      return message;

    auto count = Read<uint32_t>(ptr);
    this->clearNonFaceUpPositions(count, ptr);
  }

  if (message[0U] == MSG_MOVE)
  {
    ptr += 4U;            // Card code
    ptr += LocInfo::SIZE; // Previous location
    const auto current = Read<LocInfo>(ptr);

    if (current.con == team || IsLocInfoPublic(current))
    {
    }
    else
    {
      ptr -= 4U + (LocInfo::SIZE * 2U);
      Write<uint32_t>(ptr, 0U);
    }
  }

  if (message[0U] == MSG_SELECT_CARD)
  {
    ptr += 1U + 1U + 4U + 4U;
    auto count = Read<uint32_t>(ptr);
    ClearLocInfoArray(count, team, ptr);
  }

  if (message[0U] == MSG_SELECT_TRIBUTE)
  {
    ptr += 1U + 1U + 4U + 4U;
    auto count = Read<uint32_t>(ptr);
    for (uint32_t i = 0; i < count; i++)
    {
      ptr += 4U; // Card code
      const auto con = Read<uint8_t>(ptr);
      if (team != con)
      {
        ptr -= 4U + 1U;
        Write<uint32_t>(ptr, 0U);
        ptr += 1U;
      }
      ptr += 1U + 4U + 1U; // loc, seq, release_param
    }
  }

  if (message[0U] == MSG_SELECT_UNSELECT_CARD)
  {
    ptr += 1U + 1U + 1U + 4U + 4U;
    auto count1 = Read<uint32_t>(ptr);
    ClearLocInfoArray(count1, team, ptr);
    auto count2 = Read<uint32_t>(ptr);
    ClearLocInfoArray(count2, team, ptr);
  }
  return message;
}

void DrawCardHandler::clearNonFaceUpPositions(uint32_t count, uint8_t *&ptr)
{
  for (uint32_t i = 0U; i < count; i++)
  {
    ptr += 4U; // Card code
    auto pos = Read<uint32_t>(ptr);
    if (!(pos & POS_FACEUP))
    {
      ptr -= 4U + 4U;
      Write<uint32_t>(ptr, 0U);
      ptr += 4U;
    }
  }
}