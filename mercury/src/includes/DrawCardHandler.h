#ifndef DRAW_CARD_HANDLER
#define DRAW_CARD_HANDLER

#include <vector>
#include <iostream>
#include <cstdint>

#include "Read.h"
#include "Write.h"

#include "../ocgcore/common.h"

class DrawCardHandler {
public:
  std::vector<uint8_t> handle(uint8_t team, std::vector<uint8_t> message);
private:
  void clearNonFaceUpPositions(uint32_t count, uint8_t*& ptr);
};

#endif
