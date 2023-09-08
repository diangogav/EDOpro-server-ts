#include <nlohmann/json.hpp>

#include "iostream"
#include <iomanip>
#include "./ocgcore/ocgapi.h"
#include "./ocgcore/mtrandom.h"
#include "./includes/duel_config.h"
#include "./includes/player.h"
#include "./includes/dueling.h"
#include <stdexcept>
#include <random>

using json = nlohmann::json;

void send_message(std::string message)
{
  uint32_t message_size = static_cast<uint32_t>(message.size());
  std::cout.write(reinterpret_cast<const char *>(&message_size), sizeof(message_size));
  std::cout << message;
  std::cout.flush();
}

void from_json(const json &info, Config &config)
{
  info.at("seeds").get_to(config.seeds);
  info.at("flags").get_to(config.flags);
  info.at("lp").get_to(config.lp);
  info.at("startingDrawCount").get_to(config.starting_draw_count);
  info.at("drawCountPerTurn").get_to(config.draw_count);
  info.at("firstToPlay").get_to(config.first_to_play);
  info.at("timeLimit").get_to(config.time_limit);
  info.at("duelRule").get_to(config.duel_rule);
}

void from_json(const json &playerJson, Player &player)
{
  playerJson.at("team").get_to(player.team);
  playerJson.at("mainDeck").get_to(player.main_deck);
  playerJson.at("sideDeck").get_to(player.side_deck);
  playerJson.at("extraDeck").get_to(player.extra_deck);
  playerJson.at("turn").get_to(player.turn);
}

int main(int argc, char *argv[])
{
  std::string json_str = argv[1];
  json data = json::parse(json_str);

  /* Get duel config */
  Config config;
  data["config"].get_to(config);

  /* Get duel players */
  std::vector<Player> player_list = data.at("players").get<std::vector<Player>>();

  Dueling duel{config, player_list};
  duel.create();
  duel.load_scripts();
  duel.load_players();
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

      if (command == "PROCESS")
      {
        for (;;)
        {
          const auto status = duel.status();
          std::vector<std::vector<uint8_t>> core_messages = duel.messages();
          for (const auto &core_message : core_messages)
          {
            duel.send_raw_message(core_message, status);
            duel.distribute_message(core_message);
          };

          if (status >> 16  == 1)
          {
            break;
          }
        }
      }
    }
  }

  return 0;
}
