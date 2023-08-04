#include "DuelCreator.h"
#include "../../shared/ScriptReader.h"
#include "../../card/infrastructure/CardSqliteRepository.h"
// #include "../../shared/HttpClient.h"
#include <iostream>
#include <random>

DuelCreator::DuelCreator(OCGRepository repository) : repository{repository} {}

void myCardReaderDoneFunction(void *payload, OCG_CardData *data)
{
  // Implement your custom card reader done function here.
  printf("myCardReaderDoneFunction \n");
}

void myLogHandlerFunction(void *payload, const char *string, int type)
{
  // Implement your custom log handler function here.
  printf("Mensaje recibido: %s\n", string);
}

void *myLogHandlerPayload = nullptr;     // Replace with your own payload data.
void *myCardReaderDonePayload = nullptr; // Replace with your own payload data.

OCG_Duel DuelCreator::run(CardSqliteRepository &db, uint64_t flags, uint32_t startingLP, uint32_t startingDrawCount, uint32_t drawCountPerTurn, uint16_t extraRules)
{
  CardSqliteRepository cardRepository;

  const OCG_Player player = {
      startingLP,
      startingDrawCount,
      drawCountPerTurn};

  const OCG_Player opponent = {
      startingLP,
      startingDrawCount,
      drawCountPerTurn};

  uint8_t enableUnsafeLibraries = 0;

  std::random_device rd;
  std::mt19937_64 rng(rd());
  // std::uniform_int_distribution<uint64_t> dist(0, std::numeric_limits<uint64_t>::max());
  uint64_t randomSeed1 = std::uniform_int_distribution<uint64_t>(0, std::numeric_limits<uint64_t>::max())(rng);
  uint64_t randomSeed2 = std::uniform_int_distribution<uint64_t>(0, std::numeric_limits<uint64_t>::max())(rng);
  uint64_t randomSeed3 = std::uniform_int_distribution<uint64_t>(0, std::numeric_limits<uint64_t>::max())(rng);
  uint64_t randomSeed4 = std::uniform_int_distribution<uint64_t>(0, std::numeric_limits<uint64_t>::max())(rng);

  OCG_DuelOptions options = {
      {randomSeed1,
       randomSeed2,
       randomSeed3,
       randomSeed4},
      flags,
      player,
      opponent,
      &CardSqliteRepository::handle,
      &db,
      &ScriptReader::handle,
      &*new ScriptReader(repository),
      &myLogHandlerFunction,
      &myLogHandlerPayload,
      &myCardReaderDoneFunction,
      &myCardReaderDonePayload,
      0};

  OCG_Duel duel{nullptr};

  int duelCreationResult = repository.createDuel(&duel, options);

  std::cout << "Duel creation result: " << duelCreationResult << std::endl;

  if (duelCreationResult != OCG_DUEL_CREATION_SUCCESS)
  {
    exit(1);
  }

  std::string message = "CMD:CREATED|";
  message += std::to_string(randomSeed1) + "|";
  message += std::to_string(randomSeed2) + "|";
  message += std::to_string(randomSeed3) + "|";
  message += std::to_string(randomSeed4) + "|";
  std::cout << message << std::endl;

  return duel;
};