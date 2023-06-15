#ifndef DUEL_TIMER
#define DUEL_TIMER

#include <cstdint>

class Replier
{
public:
  static Replier &getInstance();

  void set(uint8_t id);
	uint8_t id;

private:
  Replier();
  Replier(const Replier &) = delete;
  Replier &operator=(const Replier &) = delete;
  ~Replier();
};

#endif // DUEL_TIMER
