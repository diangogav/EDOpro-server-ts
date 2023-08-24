#include <nlohmann/json.hpp>
#include <iostream>
#include <vector>
#include <string>
#include <sstream>
#include <regex>

#include "./modules/duel/infrastructure/OCGRepository.h"

#include "./includes/duel_config.h"
#include "./includes/player.h"
#include "./includes/duel.h"

using json = nlohmann::json;

void from_json(const json &info, Config &config)
{
  info.at("seeds").get_to(config.seeds);
  info.at("flags").get_to(config.flags);
  info.at("lp").get_to(config.lp);
  info.at("startingDrawCount").get_to(config.starting_draw_count);
  info.at("drawCountPerTurn").get_to(config.draw_count);
  info.at("firstToPlay").get_to(config.first_to_play);
  info.at("timeLimit").get_to(config.time_limit);
}

void from_json(const json &playerJson, Player &player)
{
  playerJson.at("team").get_to(player.team);
  playerJson.at("mainDeck").get_to(player.main_deck);
  playerJson.at("sideDeck").get_to(player.side_deck);
  playerJson.at("extraDeck").get_to(player.extra_deck);
  playerJson.at("turn").get_to(player.turn);
}

void global_exception_handler()
{
  try
  {
    throw;
  }
  catch (const std::exception &e)
  {
    std::cerr << "Excepción capturada: " << e.what() << std::endl;
  }
  catch (...)
  {
    std::cerr << "Excepción desconocida capturada" << std::endl;
  }
}

int main(int argc, char *argv[])
{
  std::set_terminate(global_exception_handler);

  std::string json_str = argv[1];
  json data = json::parse(json_str);

  /* Get duel config */
  Config config;
  data["config"].get_to(config);

  /* Get duel players */
  std::vector<Player> player_list = data.at("players").get<std::vector<Player>>();

  OCGRepository api;
  Duel duel{api, config, player_list};

  duel.create();
  duel.load_scripts();
  duel.load_decks();
  duel.start();

  while (true)
  {
    std::string message;
    std::getline(std::cin, message);

    if (!message.empty())
    {
      json json_data = json::parse(message);

      std::string command = json_data["command"];

      if (command == "REFRESH_FIELD")
      {
        uint8_t position = json_data["data"]["position"];
        uint8_t team = json_data["data"]["team"];

        duel.refresh_board(position, team);
      }

      if (command == "GET_FIELD")
      {
        uint8_t position = json_data["data"]["position"];
        duel.get_board(position);
      }

      if (command == "RESPONSE")
      {
        uint8_t replier = json_data["data"]["replier"];
        std::string response = json_data["data"]["message"];
        std::istringstream iss(response);
        std::string token;
        std::vector<uint8_t> vector;

        while (std::getline(iss, token, '|'))
        {
          uint8_t byte = static_cast<uint8_t>(std::stoi(token, nullptr, 16));
          vector.push_back(byte);
        }
        duel.set_response(replier, vector);
        command = "PROCESS";
      }

      if (command == "SET_DECKS")
      {
        duel.set_decks();
        command = "PROCESS";
      }

      if (command == "PROCESS")
      {
        bool finished = false;
        for (;;)
        {
          const auto status = duel.status();
          std::vector<std::vector<uint8_t>> core_messages = duel.messages();
          for (const auto &core_message : core_messages)
          {
            duel.send_raw_message(core_message, status);
            if (!duel.pre_processing(core_message))
            {
              core_messages = duel.messages();
              continue;
            }
            duel.process_queries(duel.pre_queries(core_message));
            duel.distribute_message(core_message);
            duel.process_queries(duel.post_queries(core_message));
            finished = duel.is_duel_finished(core_message);
            duel.post_processing(core_message);
          };

          if (status != 2 || finished == true)
          {
            break;
          }
        }
      }
    }
  }

  return 0;
}
