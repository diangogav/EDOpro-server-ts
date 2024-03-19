#ifndef DUEL_HEADER
#define DUEL_HEADER

#include <iostream>
#include <iomanip>
#include <nlohmann/json.hpp>

#include "../modules/duel/infrastructure/OCGRepository.h"
#include "../modules/card/infrastructure/CardSqliteRepository.h"
#include "../modules/shared/ScriptReader.h"
#include "../modules/shared/FileReader.h"
#include "../modules/shared/DuelLocations.h"
#include "../modules/shared/DuelPositions.h"
#include "../modules/shared/Write.h"
#include "../modules/shared/Read.h"
#include "../modules/shared/DuelStages.h"
#include "../modules/shared/QueryRequest.h"
#include "../modules/shared/ZonesRefresher.h"
#include "../modules/shared/MessageTargets.h"
#include "../modules/shared/DuelTurnTimer.h"
#include "../modules/duel/messages/domain/QueryDeserializer.h"
#include "../modules/duel/messages/domain/QuerySerializer.h"
#include "../modules/duel/messages/application/DrawCardHandler.h"
#include "../modules/duel/application/DuelTimeRemainingCalculator.h"

#include "../includes/duel_config.h"
#include "../includes/player.h"

using json = nlohmann::json;

class Duel
{
public:
  Duel(OCGRepository api, Config config, std::vector<Player> players);
  ~Duel();
  void create();
  void destroy();
  void load_scripts();
  void load_decks();
  void start();
  void set_decks();
  int status();
  std::vector<std::vector<uint8_t>> messages();
  void send_raw_message(std::vector<uint8_t> message, int status);
  bool pre_processing(std::vector<uint8_t> core_message);
  void post_processing(std::vector<uint8_t> core_message);
  std::vector<QueryRequest> pre_queries(const std::vector<uint8_t> &message);
  std::vector<QueryRequest> post_queries(const std::vector<uint8_t> &message);
  void process_queries(const std::vector<QueryRequest> &query_requests);
  void distribute_message(const std::vector<uint8_t> message);
  void set_response(uint8_t team, std::vector<uint8_t> data);
  void get_board(uint8_t position);
  void refresh_board(uint8_t position, uint8_t team);
  bool is_duel_finished(const std::vector<uint8_t> core_message);

private:
  OCGRepository api;
  Config config;
  std::vector<Player> players;
  OCG_Duel duel;
  std::unique_ptr<CardSqliteRepository> cardSqliteRepo;
  std::unique_ptr<ScriptReader> scriptReader;
  FileReader file_reader;
  QuerySerializer serializer;
  QueryDeserializer deserializer;
  DrawCardHandler handler;
  DuelTimeRemainingCalculator time_remaining_calculator;
  uint8_t replier;
  uint8_t get_swapped_team(uint8_t team);
  std::vector<uint8_t> last_hint;
  std::vector<uint8_t> last_request;
  void set_main_deck(uint8_t team);
  void set_extra_deck(uint8_t team);
  void send_start_message(uint32_t player_deck_size, uint32_t player_extra_deck_size, uint32_t opponent_deck_size, uint32_t opponent_extra_deck_size);
  void send_message_to(uint8_t team, bool cacheable, bool all, std::vector<uint8_t> core_message);
  void send_message_to_all(std::vector<uint8_t> core_message);
  void send_duel_message();
  void send_message(std::string message);
  std::vector<uint8_t> create_update_data_message(OCG_QueryInfo query, const std::vector<uint8_t> buffer);
  std::vector<uint8_t> create_update_data_message(QueryLocationRequest query, const std::vector<uint8_t> buffer);
  std::vector<uint8_t> create_update_card_message(QuerySingleRequest query, const std::vector<uint8_t> buffer);
  void send_replay_message(std::vector<uint8_t> data);
  void send_core_replay_message(std::vector<uint8_t> data);
  void send_update_card_message(uint8_t team, bool cacheable, bool all, const QuerySingleRequest &query_single_request, const std::vector<uint8_t> buffer);
  void send_update_data_message(uint8_t team, bool cacheable, bool all, const QueryLocationRequest &query_location_request, const std::vector<uint8_t> buffer);
  MessageTargets get_message_target(const std::vector<uint8_t> message);
  uint8_t get_team_message_receptor(const std::vector<uint8_t> message);
  bool does_message_required_answer(uint8_t message_type);
};

#endif