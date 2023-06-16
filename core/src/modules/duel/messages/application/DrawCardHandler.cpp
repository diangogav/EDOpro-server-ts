#include "DrawCardHandler.h"
#include "../../../shared/DuelStages.h"
#include "../../../shared/DuelLocations.h"
#include "../../../shared/QueryRequest.h"

template<>
constexpr LocInfo Read(const uint8_t*& ptr) noexcept
{
	return LocInfo
	{
		Read<uint8_t>(ptr),
		Read<uint8_t>(ptr),
		Read<uint32_t>(ptr),
		Read<uint32_t>(ptr)
	};
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

  auto *ptr = message.data();
  ptr++; // type ignored

  if(message[0U] == MSG_SET){
    Write<uint32_t>(ptr, 0U);
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