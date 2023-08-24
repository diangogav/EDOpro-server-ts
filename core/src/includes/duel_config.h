#ifndef DUEL_CONFIG_HEADER
#define DUEL_CONFIG_HEADER

#include <vector>

struct Config {
    std::vector<uint64_t> seeds;
    uint64_t flags;
    uint32_t lp;
    uint32_t starting_draw_count;
    uint32_t draw_count;
    int first_to_play;
    uint16_t time_limit;
};

#endif