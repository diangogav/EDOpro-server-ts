#ifndef PLAYER_HEADER
#define PLAYER_HEADER

struct Player
{
  uint8_t team;
  std::vector<uint32_t> main_deck;
  std::vector<uint32_t> side_deck;
  std::vector<uint32_t> extra_deck;
  uint8_t turn;
};

#endif