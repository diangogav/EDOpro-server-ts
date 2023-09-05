#include <nlohmann/json.hpp>

#include "iostream"
#include <iomanip>
#include "./ocgcore/ocgapi.h"
#include "./includes/duel_config.h"
#include "./includes/player.h"
#include <stdexcept>

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

  const auto duel = create_duel(123432423);
  preload_script(duel, "./script/special.lua", 0);
  preload_script(duel, "./script/init.lua", 0);
  set_player_info(duel, 0, config.lp, config.starting_draw_count, config.draw_count);
  set_player_info(duel, 1, config.lp, config.starting_draw_count, config.draw_count);

  for (const auto player : player_list)
  {
    for (const auto card : player.main_deck)
    {
      new_card(duel, card, player.team, player.team, LOCATION_DECK, 0, POS_FACEDOWN_DEFENSE);
    }

    for (const auto card : player.extra_deck)
    {
      new_card(duel, card, player.team, player.team, LOCATION_EXTRA, 0, POS_FACEDOWN_DEFENSE);
    }
  }

  uint32_t player_deck_size = query_field_count(duel, 0, LOCATION_DECK);
  uint32_t player_extra_deck_size = query_field_count(duel, 0, LOCATION_EXTRA);
  uint32_t opponent_deck_size = query_field_count(duel, 1, LOCATION_DECK);
  uint32_t opponent_extra_deck_size = query_field_count(duel, 1, LOCATION_EXTRA);

  json message;
  message["lp"] = config.lp;
  message["playerDeckSize"] = player_deck_size;
  message["playerExtraDeckSize"] = player_extra_deck_size;
  message["opponentDeckSize"] = opponent_deck_size;
  message["opponentExtraDeckSize"] = opponent_extra_deck_size;
  message["duelRule"] = config.duel_rule;
  message["header"] = 0x04;
  message["type"] = "START";

  std::string serialized_message = message.dump();

  send_message(serialized_message);

  int opt = (int)config.duel_rule << 16;
  start_duel(duel, opt);
  while (true)
  {
  }

  return 0;
}
