#include "DuelStarter.h"
#include <iostream>
#include <cstring>

DuelStarter::DuelStarter(OCGRepository repository, OCG_Duel duel) : repository{repository}, duel{duel} {}

void DuelStarter::start()
{
  repository.startDuel(duel);

  uint32_t playerDeckSize = repository.duelQueryCount(duel, 0, 1);
  uint32_t playerExtraDeckSize = repository.duelQueryCount(duel, 0, 0x40);
  uint32_t opponentDeckSize = repository.duelQueryCount(duel, 1, 1);
  uint32_t opponentExtraDeckSize = repository.duelQueryCount(duel, 1, 0x40);

  std::string message = "CMD:START|";
  message += std::to_string(playerDeckSize) + "|";
  message += std::to_string(playerExtraDeckSize) + "|";
  message += std::to_string(opponentDeckSize) + "|";
  message += std::to_string(opponentExtraDeckSize) + "|";
  std::cout << message << std::endl;
}