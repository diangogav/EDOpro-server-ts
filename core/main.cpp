#include "./modules/duel/infrastructure/OCGRepository.h"
#include "./modules/duel/application/DuelCreator.h"
#include "./modules/shared/CommandLineArrayParser.h"

#include <iostream>
int main(int argc, char * argv[]) {
  uint32_t startingLP = atoi(argv[1]);
  uint32_t startingDrawCount = atoi(argv[2]);
  uint32_t drawCountPerTurn = atoi(argv[3]);
  uint64_t flags = atoi(argv[4]);
  uint16_t extraRules = atoi(argv[5]);
  std::string playerMainDeckString = argv[6];
  std::string playerSideDeckString = argv[7];
  std::string opponentMainDeckString = argv[8];
  std::string opponentSideDeckString = argv[9];

  CommandLineArrayParser playerMainDeckParser(playerMainDeckString); 
  CommandLineArrayParser playerSideDeckParser(playerSideDeckString); 
  CommandLineArrayParser opponentMainDeckParser(opponentMainDeckString);
  CommandLineArrayParser opponentSideDeckParser(opponentSideDeckString); 
      
  printf("extraRules: %u\n", extraRules);

  OCGRepository repository{};
  DuelCreator duelCreator{repository};
  OCG_Duel duel = duelCreator.run(
    startingLP, 
    startingDrawCount, 
    drawCountPerTurn, 
    flags, 
    extraRules,
    playerMainDeckParser.parse(),
    opponentMainDeckParser.parse()
  );
  return 0;
}