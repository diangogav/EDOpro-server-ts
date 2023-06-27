#include "./modules/duel/application/DuelCreator.h"
#include "./modules/duel/application/DuelScriptsLoader.h"
#include "./modules/duel/application/DuelDecksLoader.h"
#include "./modules/duel/application/DuelStarter.h"
#include "./modules/duel/application/DecksSetter.h"
#include "./modules/card/infrastructure/CardSqliteRepository.h"
#include "./modules/duel/messages/application/LogMessageSender.h"
#include "./modules/shared/ZonesRefresher.h"
#include "./modules/duel/messages/domain/QueryDeserializer.h"
#include "./modules/duel/messages/domain/QuerySerializer.h"

#include "./modules/duel/infrastructure/OCGRepository.h"
#include "./modules/shared/CommandLineArrayParser.h"
#include "./modules/duel/application/DuelProcessor.h"
#include "./modules/duel/messages/domain/DuelMessageHandler.h"
#include "./modules/duel/messages/application/BufferMessageSender.h"
#include "./modules/duel/messages/application/RefreshMessageSender.h"
#include "./modules/duel/messages/application/FieldMessageSender.h"
#include "./modules/duel/messages/application/QueryRequestProcessor.h"
#include "./modules/duel/messages/post-actions/QueryCreator.h"
#include "./modules/duel/messages/pre-actions/PreActionQueryCreator.h"
#include "./modules/shared/DuelTurnTimer.h"
#include "./modules/duel/application/PostActions.h"
#include "./modules/duel/application/PreActions.h"
#include "./modules/duel/application/DuelFinishHandler.h"
#include "./modules/duel/messages/application/ResponseHandler.h"

#include <iostream>
#include <string>
#include <vector>
#include <iomanip>
#include <regex>
#include <filesystem>
namespace fs = std::filesystem;

uint8_t calculateTeam(uint8_t team, uint8_t isTeam1GoingFirst)
{
  assert(team <= 1U);
  return isTeam1GoingFirst ^ team;
}

void printVectorAsHex(const std::vector<uint8_t> &vec)
{
  for (const auto &element : vec)
  {
    std::cout << std::hex << std::setw(2) << std::setfill('0') << static_cast<int>(element) << " ";
  }
  std::cout << std::dec << std::endl;
}

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

  CardSqliteRepository cardRepository{};
  fs::path path = fs::current_path().string() + "/core/databases";
  cardRepository.merge(path.string() + "/cards-rush.cdb");
  cardRepository.merge(path.string() + "/cards-skills-unofficial.cdb");
  cardRepository.merge(path.string() + "/cards-skills.cdb");
  cardRepository.merge(path.string() + "/cards-unofficial-new.cdb");
  cardRepository.merge(path.string() + "/cards-unofficial.cdb");
  cardRepository.merge(path.string() + "/cards.cdb");
  cardRepository.merge(path.string() + "/goat-entries.cdb");
  cardRepository.merge(path.string() + "/prerelease-ac03-unofficial.cdb");
  cardRepository.merge(path.string() + "/prerelease-ac03.cdb");
  cardRepository.merge(path.string() + "/prerelease-agov.cdb");
  cardRepository.merge(path.string() + "/prerelease-cards-rush.cdb");
  cardRepository.merge(path.string() + "/prerelease-sd46.cdb");
  cardRepository.merge(path.string() + "/prerelease-vjump-promos.cdb");
  cardRepository.merge(path.string() + "/release-dp28.cdb");
  cardRepository.merge(path.string() + "/release-dune.cdb");

  OCGRepository repository{};
  DuelCreator duelCreator{repository};
  OCG_Duel duel = duelCreator.run(
      cardRepository,
      flags,
      startingLP,
      startingDrawCount,
      drawCountPerTurn,
      extraRules);

  DuelScriptsLoader duelScriptsLoader{repository, duel};
  duelScriptsLoader.load();

  DuelDecksLoader duelDecksLoader{repository, duel, isTeam1GoingFirst};
  duelDecksLoader.load(playerMainDeckParser.parse(), opponentMainDeckParser.parse());

  DuelStarter duelStarter{repository, duel};
  duelStarter.start();
  // DuelTurnTimer &timer = DuelTurnTimer::getInstance();
  // timer.resetTimers(timeLimit);

  DuelProcessor processor(repository);
  DuelMessageHandler duelMessageHandler(isTeam1GoingFirst, timeLimit);
  PreActions preActions(timeLimit, isTeam1GoingFirst);
  QueryRequestProcessor queryProcessor(repository, isTeam1GoingFirst);
  PreActionQueryCreator preActionQueryCreator;
  QueryCreator queryCreator;
  LogMessageSender logger;
  PostActions postActions(timeLimit, isTeam1GoingFirst);
  ResponseHandler responseHandler(duel, repository, timeLimit);
  DuelFinishHandler duelFinishHandler(isTeam1GoingFirst);
  ZonesRefresher zonesRefresher;
  RefreshMessageSender refreshMessageSender;
  QueryDeserializer deserializer;
  QuerySerializer serializer;

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

      if (cmd == "RESPONSE")
      {
        uint8_t team = std::atoi(params[0].c_str());
        std::vector<std::string> data(params.begin() + 1, params.end());
        std::vector<uint8_t> vectorBytes = convertToUInt8(data);
        responseHandler.handle(team, vectorBytes);
        std::cout << "CMD:DUEL" << std::endl;
      }

      if (cmd == "DECKS")
      {
        DecksSetter decksSetter{repository, duel};
        decksSetter.run();
      }

      if (cmd == "FIELD")
      {
        int team = std::atoi(params[0].c_str());
        const auto buffer = repository.duelQueryField(duel);
        FieldMessageSender fieldMessageSender;
        fieldMessageSender.send(team, buffer);
      }

      if (cmd == "REFRESH")
      {
        int reconnectingTeam = std::atoi(params[0].c_str());
        std::vector<QueryRequest> queryRequests;
        zonesRefresher.refreshAll(queryRequests);

        for (const auto &queryRequest : queryRequests)
        {
          const auto &queryLocationRequest = std::get<QueryLocationRequest>(queryRequest);
          OCG_QueryInfo query = {
              queryLocationRequest.flags,
              queryLocationRequest.con,
              queryLocationRequest.loc,
              0U,
              0U};

          uint8_t team = calculateTeam(queryLocationRequest.con, isTeam1GoingFirst);
          const auto buffer = repository.duelQueryLocation(duel, query);

          if (queryLocationRequest.loc == LOCATION_DECK)
          {
            continue;
          }

          if (queryLocationRequest.loc == LOCATION_EXTRA)
          {
            refreshMessageSender.send(reconnectingTeam, team, queryLocationRequest.loc, queryLocationRequest.con, buffer);
            continue;
          }

          const auto queries = deserializer.deserializeLocationQuery(buffer);
          const auto playerBuffer = serializer.serializeLocationQuery(queries, false);
          const auto strippedBuffer = serializer.serializeLocationQuery(queries, true);

          refreshMessageSender.send(reconnectingTeam, team, queryLocationRequest.loc, queryLocationRequest.con, playerBuffer);
          refreshMessageSender.send(reconnectingTeam, 1U - team, queryLocationRequest.loc, queryLocationRequest.con, strippedBuffer);
        }

        std::string payload = "CMD:RECONNECT|";
        payload += std::to_string(reconnectingTeam) + "|";
        std::cout << payload << std::endl;
      }

      if (cmd == "PROCESS")
      {
        bool finish = false;
        for (;;)
        {
          int status = processor.run(duel);
          std::vector<std::vector<uint8_t>> messages = repository.getMessages(duel);

          for (const auto &message : messages)
          {
            logger.send(message);
            preActions.run(message);
            queryProcessor.run(preActionQueryCreator.run(message), duel);
            duelMessageHandler.handle(message);
            queryProcessor.run(queryCreator.run(message), duel);
            finish = duelFinishHandler.handle(message);
            // postActions.run(message);
          }
          if (status != 2 || finish == true)
          {
            break;
          }
        }
      }
    }
  }

  return 0;
}