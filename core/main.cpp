#include "./modules/duel/infrastructure/OCGRepository.h"
#include "./modules/duel/application/DuelCreator.h"
#include "./modules/shared/CommandLineArrayParser.h"
#include "./modules/duel/application/DuelProcessor.h"
#include "./modules/duel/messages/domain/DuelMessageHandler.h"

#include <iostream>
#include <string>
#include <vector>
#include <iomanip>

// Función para separar una cadena en substrings dado un delimitador
std::vector<std::string> split(const std::string &str, char delimiter)
{
  std::vector<std::string> tokens;
  std::string token;
  std::istringstream tokenStream(str);
  while (std::getline(tokenStream, token, delimiter))
  {
    tokens.push_back(token);
  }
  return tokens;
}

int main(int argc, char *argv[])
{
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
      flags,
      startingLP,
      startingDrawCount,
      drawCountPerTurn,
      extraRules,
      playerMainDeckParser.parse(),
      opponentMainDeckParser.parse());

  std::string message;
  while (true)
  {
    std::getline(std::cin, message);
    std::vector<std::string> instructions = split(message, '|');
    std::cout << "Instrucción recibida: " << message << std::endl;

    // Procesar cada instrucción individualmente
    for (const std::string &instruction : instructions)
    {
      std::cout << "Instrucción recibida: " << instruction << std::endl;

      // Realizar el procesamiento necesario con la instrucción recibida
      if (instruction == "CMD:RECORD_DECKS")
      {
        std::vector<uint8_t> buffer = repository.duelQueryLocation(duel, 0);

        std::string payload = "CMD:BUFFER|";
        payload += std::to_string(64) + "|";
        payload += std::to_string(0) + "|";

        for (const auto &element : buffer)
        {
          payload += std::to_string(static_cast<int>(element)) + "|";
        }

        std::cout << payload << std::endl;

        std::string opponentPayload = "CMD:BUFFER|";
        opponentPayload += std::to_string(64) + "|";
        opponentPayload += std::to_string(1) + "|";

        for (const auto &element : buffer)
        {
          opponentPayload += std::to_string(static_cast<int>(element)) + "|";
        }

        std::cout << opponentPayload << std::endl;

        std::cout << "CMD:DUEL" << std::endl;
      }

      if (instruction == "CMD:PROCESS")
      {
        DuelProcessor processor(repository);
        int status = processor.run(duel);
        std::vector<std::vector<uint8_t>> messages = repository.getMessages(duel);

        DuelMessageHandler duelMessageHandler;
        for (const auto &message : messages)
        {
          std::vector<uint8_t> team0Message = duelMessageHandler.handle(0, message);
          std::vector<uint8_t> team1Message = duelMessageHandler.handle(1, message);

          std::string team1Payload = "CMD:MESSAGE|";
          team1Payload += std::to_string(1) + "|";
          for (const auto &element : team1Message)
          {
              team1Payload += std::to_string(static_cast<int>(element)) + "|";
          }
          std::cout << team1Payload << std::endl;

          std::string team0Payload = "CMD:MESSAGE|";
          team0Payload += std::to_string(0) + "|";
          for (const auto &element : team0Message)
          {
              team0Payload += std::to_string(static_cast<int>(element)) + "|";
          }
          std::cout << team0Payload << std::endl;
        }
      }
    }
  }

  return 0;
}