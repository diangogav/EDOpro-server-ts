#include "DuelMessageHandler.h"

std::vector<uint8_t> DuelMessageHandler::handle(uint8_t team, std::vector<uint8_t> message)
{
  uint8_t messageType = message[0];
  auto *ptr = message.data();
  ptr++; // type ignored

  if (Read<uint8_t>(ptr) == team)
    return message;

  auto count = Read<uint32_t>(ptr);
  this->clearNonFaceUpPositions(count, ptr);
  return message;
}

void DuelMessageHandler::clearNonFaceUpPositions(uint32_t count, uint8_t *&ptr)
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