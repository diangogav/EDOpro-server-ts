#include "./modules/duel/infrastructure/OCGRepository.h"
#include "./modules/duel/application/DuelCreator.h"
#include "./modules/shared/CommandLineArrayParser.h"
#include "./modules/duel/application/DuelProcessor.h"
#include "./modules/duel/messages/domain/DuelMessageHandler.h"
#include "./modules/duel/messages/application/BufferMessageSender.h"
#include "./modules/duel/messages/application/QueryRequestProcessor.h"
#include "./modules/duel/messages/post-actions/QueryCreator.h"
#include "./modules/duel/messages/pre-actions/PreActionQueryCreator.h"

#include <iostream>
#include <string>
#include <vector>
#include <iomanip>
#include <regex>

std::vector<uint8_t> convertToUInt8(const std::vector<std::string> &vectorStrings)
{
  std::vector<uint8_t> vectorBytes;
  vectorBytes.reserve(vectorStrings.size());

  for (const std::string &hexString : vectorStrings)
  {
    int intValue = std::stoi(hexString, nullptr, 16);
    uint8_t byteValue = static_cast<uint8_t>(intValue);
    vectorBytes.push_back(byteValue);
  }

  return vectorBytes;
}

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
  uint8_t isTeam1GoingFirst = atoi(argv[6]);
  uint16_t timeLimit = atoi(argv[7]);
  std::string playerMainDeckString = argv[8];
  std::string playerSideDeckString = argv[9];
  std::string opponentMainDeckString = argv[10];
  std::string opponentSideDeckString = argv[11];

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

  DuelProcessor processor(repository);
  DuelMessageHandler duelMessageHandler(isTeam1GoingFirst);
  QueryRequestProcessor queryProcessor(repository, isTeam1GoingFirst);
  PreActionQueryCreator preActionQueryCreator;
  QueryCreator queryCreator;

  std::string message;
  while (true)
  {
    std::getline(std::cin, message);
    std::cout << "Instrucción recibida: " << message << std::endl;
    std::regex regex("CMD:[A-Z]+(\\|[a-zA-Z0-9]+)*");
    std::smatch matches;

    std::vector<std::string> commands;
    std::string::const_iterator searchStart(message.cbegin());

    while (std::regex_search(searchStart, message.cend(), matches, regex))
    {
      std::string command = matches.str();
      commands.push_back(command);
      searchStart = matches.suffix().first;
    }
    // Procesar cada instrucción individualmente
    for (const std::string &instruction : commands)
    {
      std::regex paramRegex("\\|([a-zA-Z0-9]+)");
      std::sregex_iterator paramIter(instruction.begin(), instruction.end(), paramRegex);
      std::sregex_iterator end;

      std::vector<std::string> params;
      for (; paramIter != end; ++paramIter)
      {
        params.push_back((*paramIter)[1]);
      }

      std::string cmd = instruction.substr(4, instruction.find_first_of("|") - 4);

      std::cout << "Instrucción recibida!!!!: " << cmd << std::endl;

      // Realizar el procesamiento necesario con la instrucción recibida

      if (cmd == "RESPONSE")
      {
        uint8_t team = std::atoi(params[0].c_str());
        std::vector<std::string> data(params.begin() + 1, params.end());
        std::vector<uint8_t> vectorBytes = convertToUInt8(data);
        repository.setResponse(duel, vectorBytes);
        std::cout << "CMD:DUEL" << std::endl;
      }

      if (cmd == "DECKS")
      {
        OCG_QueryInfo query = {
            0x381FFF,
            0,
            0x40,
            0U,
            0U};
        std::vector<uint8_t> buffer = repository.duelQueryLocation(duel, query);

        BufferMessageSender sender;

        sender.send(0, 64, 0, buffer);
        sender.send(1, 64, 1, buffer);

        std::cout << "CMD:DUEL" << std::endl;
      }

      if (cmd == "PROCESS")
      {
        for (;;)
        {
          int status = processor.run(duel);
          std::vector<std::vector<uint8_t>> messages = repository.getMessages(duel);

          for (const auto &message : messages)
          {
            uint8_t messageType = message[0U];

            if (messageType != 1)
            {
              std::string payload = "CMD:LOG|";
              payload += std::to_string(messageType) + "|";
              std::cout << payload << std::endl;
            }
            // printf("===============================message============================\n");
            // printf("%x", messageType);
            // printf("\n");
            queryProcessor.run(preActionQueryCreator.run(message), duel);
            duelMessageHandler.handle(message);
            queryProcessor.run(queryCreator.run(message), duel);
          }
          if (status != 2)
          {
            break;
          }
        }
      }
    }
  }

  return 0;
}