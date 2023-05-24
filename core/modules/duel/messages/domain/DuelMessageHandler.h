#ifndef DUEL_MESSAGE_HANDLER
#define DUEL_MESSAGE_HANDLER

#include <iostream>
#include <vector>

#include "../../../shared/Read.h"
#include "../../../shared/Write.h"
#include "../../../shared/DuelPositions.h"

class DuelMessageHandler {
public:
  std::vector<uint8_t> handle(uint8_t team, std::vector<uint8_t> message);
private:
  void clearNonFaceUpPositions(uint32_t count, uint8_t*& ptr);
};

#endif