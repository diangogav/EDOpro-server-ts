#include "../includes/duel.h"
#include <stdexcept>

template <>
constexpr LocInfo Read(const uint8_t *&ptr) noexcept
{
  return LocInfo{
      Read<uint8_t>(ptr),
      Read<uint8_t>(ptr),
      Read<uint32_t>(ptr),
      Read<uint32_t>(ptr)};
}

void cardReaderDone(void *payload, OCG_CardData *data)
{
  // Implement your custom card reader done function here.
}

void logHandlerFunction(void *payload, const char *string, int type)
{
  // Implement your custom log handler function here.
}

void *logHandlerPayload = nullptr;     // Replace with your own payload data.
void *cardReaderDonePayload = nullptr; // Replace with your own payload data.

Duel::Duel(OCGRepository api, Config config, std::vector<Player> players) : api{api}, config{config}, players{players}
{
  FileReader file_reader;
  QuerySerializer serializer;
  QueryDeserializer deserializer;
  DrawCardHandler handler;
  DuelTimeRemainingCalculator time_remaining_calculator;
};

void Duel::create()
{
  const OCG_Player player = {
      this->config.lp,
      this->config.starting_draw_count,
      this->config.draw_count};

  OCG_DuelOptions options = {
      {this->config.seeds[0],
       this->config.seeds[1],
       this->config.seeds[2],
       this->config.seeds[3]},
      this->config.flags,
      player,
      player,
      &CardSqliteRepository::handle,
      &*new CardSqliteRepository(),
      &ScriptReader::handle,
      &*new ScriptReader(this->api),
      &logHandlerFunction,
      &logHandlerPayload,
      &cardReaderDone,
      &cardReaderDonePayload,
      0};

  this->duel = {nullptr};
  int duel_creation_result = this->api.createDuel(&this->duel, options);
}

void Duel::load_scripts()
{
  std::filesystem::path current_path = std::filesystem::current_path();
  std::filesystem::path scripts_path = current_path / "core/scripts";
  const char *path = scripts_path.c_str();

  std::vector<char> constants_buffer = this->file_reader.read(path, "constant.lua");
  this->api.loadScript(this->duel, constants_buffer.data(), constants_buffer.size(), "constant.lua");

  std::vector<char> utilityBuffer = this->file_reader.read(path, "utility.lua");
  this->api.loadScript(this->duel, utilityBuffer.data(), utilityBuffer.size(), "utility.lua");
}

void Duel::load_decks()
{
  for (const auto &player : this->players)
  {
    OCG_NewCardInfo card_info{};
    card_info.team = this->get_swapped_team(player.team);
    card_info.duelist = player.turn;
    card_info.con = this->get_swapped_team(player.team);
    card_info.loc = LOCATION_DECK;
    card_info.seq = 0;
    card_info.pos = POS_FACEDOWN_DEFENSE;

    for (const auto &card : player.main_deck)
    {
      card_info.code = card;
      this->api.addCard(this->duel, card_info);
    }

    card_info.loc = LOCATION_EXTRA;

    for (const auto &card : player.extra_deck)
    {
      card_info.code = card;
      this->api.addCard(this->duel, card_info);
    }
  }
}

void Duel::start()
{
  this->api.startDuel(this->duel);
  DuelTurnTimer &timer = DuelTurnTimer::getInstance();
  timer.resetTimers(this->config.time_limit);

  uint32_t player_deck_size = this->api.duelQueryCount(this->duel, 0, LOCATION_DECK);
  uint32_t player_extra_deck_size = this->api.duelQueryCount(this->duel, 0, LOCATION_EXTRA);
  uint32_t opponent_deck_size = this->api.duelQueryCount(this->duel, 1, LOCATION_DECK);
  uint32_t opponent_extra_deck_size = this->api.duelQueryCount(this->duel, 1, LOCATION_EXTRA);

  this->send_start_message(player_deck_size, player_extra_deck_size, opponent_deck_size, opponent_extra_deck_size);
}

void Duel::set_decks()
{
  this->set_main_deck(0U);
  this->set_main_deck(1U);
  this->set_extra_deck(0U);
  this->set_extra_deck(1U);
}

void Duel::get_board(uint8_t position)
{
  const auto core_message = this->api.duelQueryField(this->duel);

  std::vector<uint8_t> data(2 + core_message.size());
  auto *data_ptr = data.data();
  Write<uint8_t>(data_ptr, 0x01);
  Write<uint8_t>(data_ptr, 0xa2);
  std::memcpy(data_ptr, core_message.data(), core_message.size());

  std::stringstream hex_representation;
  for (const auto byte : data)
  {
    hex_representation << std::hex << std::setw(2) << std::setfill('0') << static_cast<int>(byte);
  }

  json message;
  message["data"] = hex_representation.str();
  message["type"] = "FIELD";
  message["position"] = position;

  std::string serialized_message = message.dump();

  this->send_message(serialized_message);
}

void Duel::send_core_replay_message(std::vector<uint8_t> core_message)
{
  switch (core_message[0U])
  {
  case MSG_HINT:
  {
    switch (core_message[1U])
    {
    // Do not record player specific hints.
    case 1U:
    case 2U:
    case 3U:
    case 5U:
      return;
    }
    break;
  }
  case MSG_SELECT_BATTLECMD:
  case MSG_SELECT_IDLECMD:
  case MSG_SELECT_EFFECTYN:
  case MSG_SELECT_YESNO:
  case MSG_SELECT_OPTION:
  case MSG_SELECT_CHAIN:
  case MSG_SELECT_PLACE:
  case MSG_SELECT_DISFIELD:
  case MSG_SELECT_POSITION:
  case MSG_SELECT_COUNTER:
  case MSG_SELECT_SUM:
  case MSG_SORT_CARD:
  case MSG_SORT_CHAIN:
  case MSG_ROCK_PAPER_SCISSORS:
  case MSG_ANNOUNCE_RACE:
  case MSG_ANNOUNCE_ATTRIB:
  case MSG_ANNOUNCE_CARD:
  case MSG_ANNOUNCE_NUMBER:
  case MSG_SELECT_CARD:
  case MSG_SELECT_TRIBUTE:
  case MSG_SELECT_UNSELECT_CARD:
    return;
  }

  std::vector<uint8_t> data(1 + core_message.size());
  auto *data_ptr = data.data();
  Write<uint8_t>(data_ptr, 0x01);
  std::memcpy(data_ptr, core_message.data(), core_message.size());

  this->send_replay_message(data);
}

void Duel::refresh_board(uint8_t position, uint8_t team)
{
  std::vector<QueryRequest> query_requests;
  ZonesRefresher::refreshAll(query_requests);

  for (const auto &query_request : query_requests)
  {
    const auto &query_location_request = std::get<QueryLocationRequest>(query_request);
    OCG_QueryInfo query = {
        query_location_request.flags,
        query_location_request.con,
        query_location_request.loc,
        0U,
        0U};

    uint8_t team = this->get_swapped_team(query_location_request.con);
    const auto buffer = this->api.duelQueryLocation(duel, query);

    if (query_location_request.loc == LOCATION_DECK)
    {
      continue;
    }

    const auto queries = this->deserializer.deserializeLocationQuery(buffer);
    const auto player_buffer = this->serializer.serializeLocationQuery(queries, false);
    const auto stripped_buffer = this->serializer.serializeLocationQuery(queries, true);

    this->send_update_data_message(team, false, true, query_location_request, player_buffer);
    this->send_update_data_message(1 - team, false, true, query_location_request, stripped_buffer);
  }

  json message;
  message["type"] = "RECONNECT";
  message["position"] = position;
  message["team"] = team;

  std::string serialized_message = message.dump();

  this->send_message(serialized_message);
}

void Duel::set_response(uint8_t team, std::vector<uint8_t> data)
{
  this->time_remaining_calculator.reduce(team);
  this->api.setResponse(this->duel, data);
}

int Duel::status()
{
  return this->api.process(this->duel);
}

std::vector<std::vector<uint8_t>> Duel::messages()
{
  return this->api.getMessages(this->duel);
}

void Duel::send_raw_message(std::vector<uint8_t> core_message, int status)
{
  std::stringstream hex_representation;
  for (const auto byte : core_message)
  {
    hex_representation << std::hex << std::setw(2) << std::setfill('0') << static_cast<int>(byte);
  }

  json message;
  message["message"] = core_message[0U];
  message["data"] = hex_representation.str();
  message["type"] = "CORE";
  message["size"] = core_message.size();
  message["status"] = status;

  std::string serialized_message = message.dump();

  this->send_message(serialized_message);
}

void Duel::send_replay_message(std::vector<uint8_t> data)
{
  std::stringstream hex_representation;
  for (const auto byte : data)
  {
    hex_representation << std::hex << std::setw(2) << std::setfill('0') << static_cast<int>(byte);
  }

  json message;
  message["data"] = hex_representation.str();
  message["type"] = "REPLAY";

  std::string serialized_message = message.dump();

  this->send_message(serialized_message);
}

void Duel::set_main_deck(uint8_t team)
{
  OCG_QueryInfo query = {
      0x1181FFF,
      team,
      LOCATION_DECK,
      0U,
      0U};

  const std::vector<uint8_t> buffer = this->api.duelQueryLocation(this->duel, query);

  const auto data = this->create_update_data_message(query, buffer);
  this->send_replay_message(data);
}

void Duel::set_extra_deck(uint8_t team)
{
  OCG_QueryInfo query = {
      0x381FFF,
      team,
      LOCATION_EXTRA,
      0,
      0};

  const std::vector<uint8_t> buffer = this->api.duelQueryLocation(this->duel, query);

  const auto data = this->create_update_data_message(query, buffer);
  this->send_replay_message(data);

  std::stringstream hex_representation;
  for (const auto byte : data)
  {
    hex_representation << std::hex << std::setw(2) << std::setfill('0') << static_cast<int>(byte);
  }

  json _message;

  _message["header"] = 0x01;
  _message["data"] = hex_representation.str();
  _message["receiver"] = this->get_swapped_team(query.con);
  _message["type"] = "MESSAGE";

  std::string serialized_message = _message.dump();
  this->send_message(serialized_message);
}

std::vector<uint8_t> Duel::create_update_data_message(OCG_QueryInfo query, const std::vector<uint8_t> buffer)
{
  std::vector<uint8_t> data(4 + buffer.size());
  auto *data_ptr = data.data();
  Write<uint8_t>(data_ptr, 0x01);
  Write<uint8_t>(data_ptr, 0x06);
  Write<uint8_t>(data_ptr, query.con);
  Write<uint8_t>(data_ptr, query.loc);
  std::memcpy(data_ptr, buffer.data(), buffer.size());

  return data;
}

uint8_t Duel::get_swapped_team(uint8_t team)
{
  return this->config.first_to_play ^ team;
}

void Duel::send_start_message(uint32_t player_deck_size, uint32_t player_extra_deck_size, uint32_t opponent_deck_size, uint32_t opponent_extra_deck_size)
{
  json message;
  message["lp"] = this->config.lp;
  message["playerDeckSize"] = player_deck_size;
  message["playerExtraDeckSize"] = player_extra_deck_size;
  message["opponentDeckSize"] = opponent_deck_size;
  message["opponentExtraDeckSize"] = opponent_extra_deck_size;
  message["header"] = 0x04;
  message["type"] = "START";

  std::string serialized_message = message.dump();
  this->send_message(serialized_message);
}

void Duel::send_message(std::string message)
{
  uint32_t message_size = static_cast<uint32_t>(message.size());
  std::cout.write(reinterpret_cast<const char *>(&message_size), sizeof(message_size));
  std::cout << message;
  std::cout.flush();
}

bool Duel::pre_processing(std::vector<uint8_t> core_message)
{
  uint8_t message_type = core_message[0U];

  if (message_type == MSG_RETRY)
  {
    if (!this->last_hint.empty())
      this->send_message_to(this->replier, false, false, this->last_hint);
    // duelMessageSender.send(0, 0, Replier::getInstance().id, this->lastHint);

    this->send_message_to(this->replier, false, false, this->last_request);
    // duelMessageSender.send(0, 0, Replier::getInstance().id, this->lastRequest);

    return false;
  }

  if (message_type == MSG_TAG_SWAP)
  {
    uint8_t team = this->get_swapped_team(core_message[1U]);
    json _message;

    _message["type"] = "SWAP";
    _message["team"] = team;

    std::string serialized_message = _message.dump();

    this->send_message(serialized_message);
  }

  if (message_type == MSG_HINT && core_message[1U] == 3U)
  {
    this->last_hint = core_message;
  }

  if (message_type == MSG_NEW_TURN)
  {
    DuelTurnTimer &timer = DuelTurnTimer::getInstance();
    timer.resetTimers(this->config.time_limit);
  }

  if (this->does_message_required_answer(message_type))
  {
    uint8_t team = this->get_swapped_team(this->get_team_message_receptor(core_message));
    this->replier = team;
    this->last_request = core_message;
  }

  return true;
}

void Duel::post_processing(std::vector<uint8_t> core_message)
{
  uint8_t message_type = core_message[0U];

  if (this->does_message_required_answer(message_type))
  {
    std::vector<uint8_t> data(2);
    auto *data_ptr = data.data();
    Write<uint8_t>(data_ptr, 0x01);
    Write<uint8_t>(data_ptr, 0x03);

    std::stringstream hex_representation;
    for (const auto byte : data)
    {
      hex_representation << std::hex << std::setw(2) << std::setfill('0') << static_cast<int>(byte);
    }

    json _message;

    _message["header"] = 0x01;
    _message["data"] = hex_representation.str();
    _message["except"] = this->replier;
    _message["type"] = "MESSAGE";

    std::string serialized_message = _message.dump();

    this->send_message(serialized_message);

    if (this->config.time_limit != 0U)
    {
      uint8_t team = this->get_swapped_team(this->get_team_message_receptor(core_message));
      uint16_t ticks = this->time_remaining_calculator.calculate(team);
      json message;
      message["team"] = team;
      message["time"] = ticks;
      message["type"] = "TIME";

      std::string serialized_message = message.dump();
      this->send_message(serialized_message);
    }

    return;
  }
}

std::vector<QueryRequest> Duel::pre_queries(const std::vector<uint8_t> &message)
{
  uint8_t message_type = message[0U];
  std::vector<QueryRequest> query_requests;

  if (message_type == MSG_NEW_TURN || message_type == MSG_SELECT_CHAIN)
  {
    ZonesRefresher::refreshAllMZones(query_requests);
    ZonesRefresher::refreshAllSZones(query_requests);
  }

  if (message_type == MSG_SELECT_IDLECMD || message_type == MSG_SELECT_BATTLECMD)
  {
    ZonesRefresher::refreshAllHands(query_requests);
    ZonesRefresher::refreshAllMZones(query_requests);
    ZonesRefresher::refreshAllSZones(query_requests);
  }

  if (message_type == MSG_FLIPSUMMONING)
  {
    const auto *ptr = message.data();
    ptr++;     // type ignored
    ptr += 4U; // Card code
    const auto i = Read<LocInfo>(ptr);
    query_requests.emplace_back(QuerySingleRequest{i.con, i.loc, i.seq, 0x3F81FFF});
  }

  return query_requests;
}

std::vector<QueryRequest> Duel::post_queries(const std::vector<uint8_t> &message)
{
  uint8_t messageType = message[0U];
  auto *ptr = message.data();
  ptr++;
  std::vector<QueryRequest> queryRequests;

  if (messageType == MSG_DRAW || messageType == MSG_SHUFFLE_HAND)
  {
    auto player = Read<uint8_t>(ptr);
    queryRequests.emplace_back(QueryLocationRequest{player, 0x02, 0x3781FFF});
  }

  if (messageType == MSG_SWAP)
  {
    ptr += 4U; // Previous card code
    const auto p = Read<LocInfo>(ptr);
    ptr += 4U; // Current card code
    const auto c = Read<LocInfo>(ptr);
    queryRequests.emplace_back(QuerySingleRequest{p.con, p.loc, p.seq, 0x3F81FFF});
    queryRequests.emplace_back(QuerySingleRequest{c.con, c.loc, c.seq, 0x3F81FFF});
  }

  if (messageType == MSG_NEW_PHASE || messageType == MSG_CHAINED)
  {
    ZonesRefresher::refreshAllMZones(queryRequests);
    ZonesRefresher::refreshAllSZones(queryRequests);
    ZonesRefresher::refreshAllHands(queryRequests);
  }

  if (messageType == MSG_SPSUMMONED || messageType == MSG_SUMMONED || messageType == MSG_FLIPSUMMONED)
  {
    ZonesRefresher::refreshAllMZones(queryRequests);
    ZonesRefresher::refreshAllSZones(queryRequests);
  }

  if (messageType == MSG_DAMAGE_STEP_START || messageType == MSG_DAMAGE_STEP_END)
  {
    ZonesRefresher::refreshAllMZones(queryRequests);
  }

  if (messageType == MSG_CHAIN_END)
  {
    ZonesRefresher::refreshAllDecks(queryRequests);
    ZonesRefresher::refreshAllMZones(queryRequests);
    ZonesRefresher::refreshAllSZones(queryRequests);
    ZonesRefresher::refreshAllHands(queryRequests);
  }

  if (messageType == MSG_MOVE)
  {
    ptr += 4U; // Card code
    const auto previous = Read<LocInfo>(ptr);
    const auto current = Read<LocInfo>(ptr);
    if ((previous.con != current.con || previous.loc != current.loc) &&
        current.loc != 0U && (current.loc & LOCATION_OVERLAY) == 0U)
    {
      queryRequests.emplace_back(QuerySingleRequest{
          current.con,
          current.loc,
          current.seq,
          0x3F81FFF});
    }
  }

  if (messageType == MSG_TAG_SWAP)
  {
    auto player = Read<uint8_t>(ptr);
    queryRequests.reserve(7U);
    queryRequests.emplace_back(QueryLocationRequest{player, LOCATION_DECK, 0x1181FFF});
    queryRequests.emplace_back(QueryLocationRequest{player, LOCATION_EXTRA, 0x381FFF});
    queryRequests.emplace_back(QueryLocationRequest{player, LOCATION_HAND, 0x3781FFF});
    queryRequests.emplace_back(QueryLocationRequest{0U, LOCATION_MZONE, 0x3081FFF});
    queryRequests.emplace_back(QueryLocationRequest{1U, LOCATION_MZONE, 0x3081FFF});
    queryRequests.emplace_back(QueryLocationRequest{0U, LOCATION_SZONE, 0x30681FFF});
    queryRequests.emplace_back(QueryLocationRequest{1U, LOCATION_SZONE, 0x30681FFF});
  }

  if (messageType == MSG_RELOAD_FIELD)
  {
    queryRequests.emplace_back(QueryLocationRequest{0U, LOCATION_EXTRA, 0x381FFF});
    queryRequests.emplace_back(QueryLocationRequest{1U, LOCATION_EXTRA, 0x381FFF});
  }

  if (messageType == MSG_SHUFFLE_EXTRA)
  {
    auto player = Read<uint8_t>(ptr);
    queryRequests.emplace_back(QueryLocationRequest{player, LOCATION_EXTRA, 0x381FFF});
  }

  if (messageType == MSG_SWAP_GRAVE_DECK)
  {
    auto player = Read<uint8_t>(ptr);
    queryRequests.emplace_back(QueryLocationRequest{player, LOCATION_GRAVE, 0x381FFF});
  }

  if (messageType == MSG_REVERSE_DECK)
  {
    ZonesRefresher::refreshAllDecks(queryRequests);
  }

  if (messageType == MSG_SHUFFLE_SET_CARD)
  {
    auto loc = Read<uint8_t>(ptr);
    queryRequests.emplace_back(QueryLocationRequest{0U, loc, 0x3181FFF});
    queryRequests.emplace_back(QueryLocationRequest{1U, loc, 0x3181FFF});
  }

  if (messageType == MSG_POS_CHANGE)
  {
    ptr += 4U;                    // Card code
    auto cc = Read<uint8_t>(ptr); // Current controller
    auto cl = Read<uint8_t>(ptr); // Current location
    auto cs = Read<uint8_t>(ptr); // Current sequence
    auto pp = Read<uint8_t>(ptr); // Previous position
    auto cp = Read<uint8_t>(ptr); // Current position
    if ((pp & POS_FACEDOWN) && (cp & POS_FACEUP))
      queryRequests.emplace_back(QuerySingleRequest{cc, cl, cs, 0x3F81FFF});
  }

  return queryRequests;
}

void Duel::process_queries(const std::vector<QueryRequest> &query_requests)
{
  for (const auto &query_request : query_requests)
  {
    if (std::holds_alternative<QuerySingleRequest>(query_request))
    {
      const auto &query_single_request = std::get<QuerySingleRequest>(query_request);
      OCG_QueryInfo query = {
          query_single_request.flags,
          query_single_request.con,
          query_single_request.loc,
          query_single_request.seq,
          0U};

      const auto buffer = this->api.duelQuery(duel, query);
      const auto duel_query = this->deserializer.deserialize(buffer);
      const auto player_buffer = this->serializer.serialize(duel_query, false);
      const auto stripped_buffer = this->serializer.serialize(duel_query, true);

      // TODO: SEND REPLAY MESSAGE
      const auto replay_data = this->create_update_card_message(query_single_request, buffer);
      this->send_replay_message(replay_data);
      // addMessageToReplay.sendUpdateCard(query_single_request.con, query_single_request.loc, query_single_request.seq, buffer);

      uint8_t team = this->get_swapped_team(query_single_request.con);

      this->send_update_card_message(team, true, true, query_single_request, player_buffer);
      this->send_update_card_message(1 - team, true, true, query_single_request, stripped_buffer);
      this->send_update_card_message(3, true, true, query_single_request, stripped_buffer);
    }
    else
    {
      const auto &query_location_request = std::get<QueryLocationRequest>(query_request);
      OCG_QueryInfo query = {
          query_location_request.flags,
          query_location_request.con,
          query_location_request.loc,
          0U,
          0U};

      uint8_t team = this->get_swapped_team(query_location_request.con);
      const auto buffer = this->api.duelQueryLocation(duel, query);

      if (query_location_request.loc == LOCATION_DECK)
      {
        continue;
      }

      // TODO: SEND REPLAY MESSAGE
      const auto replay_data = this->create_update_data_message(query_location_request, buffer);
      this->send_replay_message(replay_data);
      // addMessageToReplay.sendUpdateData(query_location_request.con, query_location_request.loc, buffer);

      const auto queries = this->deserializer.deserializeLocationQuery(buffer);
      const auto player_buffer = this->serializer.serializeLocationQuery(queries, false);
      const auto stripped_buffer = this->serializer.serializeLocationQuery(queries, true);

      this->send_update_data_message(team, true, true, query_location_request, player_buffer);
      this->send_update_data_message(1 - team, true, true, query_location_request, stripped_buffer);
      this->send_update_data_message(3, true, true, query_location_request, stripped_buffer);
    }
  }
}

void Duel::send_update_card_message(uint8_t team, bool cacheable, bool all, const QuerySingleRequest &query_single_request, const std::vector<uint8_t> buffer)
{
  const auto data = this->create_update_card_message(query_single_request, buffer);

  std::stringstream hex_representation;
  for (const auto byte : data)
  {
    hex_representation << std::hex << std::setw(2) << std::setfill('0') << static_cast<int>(byte);
  }

  json _message;

  _message["header"] = 0x01;
  _message["data"] = hex_representation.str();
  _message["receiver"] = team;
  _message["type"] = "MESSAGE";
  _message["cacheable"] = cacheable;
  _message["all"] = all;

  std::string serialized_message = _message.dump();
  this->send_message(serialized_message);
}

std::vector<uint8_t> Duel::create_update_card_message(QuerySingleRequest query, const std::vector<uint8_t> buffer)
{
  std::vector<uint8_t> data(5 + buffer.size());
  auto *data_ptr = data.data();
  Write<uint8_t>(data_ptr, 0x01);
  Write<uint8_t>(data_ptr, 0x07);
  Write<uint8_t>(data_ptr, query.con);
  Write<uint8_t>(data_ptr, query.loc);
  Write<uint8_t>(data_ptr, query.seq);
  std::memcpy(data_ptr, buffer.data(), buffer.size());

  return data;
}

std::vector<uint8_t> Duel::create_update_data_message(QueryLocationRequest query, const std::vector<uint8_t> buffer)
{
  std::vector<uint8_t> data(4 + buffer.size());
  auto *data_ptr = data.data();
  Write<uint8_t>(data_ptr, 0x01);
  Write<uint8_t>(data_ptr, 0x06);
  Write<uint8_t>(data_ptr, query.con);
  Write<uint8_t>(data_ptr, query.loc);
  std::memcpy(data_ptr, buffer.data(), buffer.size());

  return data;
}

void Duel::send_update_data_message(uint8_t team, bool cacheable, bool all, const QueryLocationRequest &query_location_request, const std::vector<uint8_t> buffer)
{
  const auto data = this->create_update_data_message(query_location_request, buffer);

  std::stringstream hex_representation;
  for (const auto byte : data)
  {
    hex_representation << std::hex << std::setw(2) << std::setfill('0') << static_cast<int>(byte);
  }

  json _message;

  _message["header"] = 0x01;
  _message["data"] = hex_representation.str();
  _message["receiver"] = team;
  _message["type"] = "MESSAGE";
  _message["cacheable"] = cacheable;
  _message["all"] = all;

  std::string serialized_message = _message.dump();
  this->send_message(serialized_message);
}

void Duel::send_message_to(uint8_t team, bool cacheable, bool all, std::vector<uint8_t> core_message)
{
  std::vector<uint8_t> data(1 + core_message.size());
  auto *data_ptr = data.data();
  Write<uint8_t>(data_ptr, 0x01);
  std::memcpy(data_ptr, core_message.data(), core_message.size());

  std::stringstream hex_representation;
  for (const auto byte : data)
  {
    hex_representation << std::hex << std::setw(2) << std::setfill('0') << static_cast<int>(byte);
  }

  json message;
  message["data"] = hex_representation.str();
  message["type"] = "MESSAGE";
  message["receiver"] = team;
  message["all"] = all;
  message["cacheable"] = cacheable;

  std::string serialized_message = message.dump();

  this->send_message(serialized_message);
}

void Duel::send_message_to_all(std::vector<uint8_t> core_message)
{
  std::vector<uint8_t> data(1 + core_message.size());
  auto *data_ptr = data.data();
  Write<uint8_t>(data_ptr, 0x01);
  std::memcpy(data_ptr, core_message.data(), core_message.size());

  std::stringstream hex_representation;
  for (const auto byte : data)
  {
    hex_representation << std::hex << std::setw(2) << std::setfill('0') << static_cast<int>(byte);
  }

  json message;
  message["data"] = hex_representation.str();
  message["type"] = "MESSAGE_ALL";

  std::string serialized_message = message.dump();

  this->send_message(serialized_message);
}

MessageTargets Duel::get_message_target(const std::vector<uint8_t> message)
{
  switch (message[0U])
  {
  case MSG_SELECT_CARD:
  case MSG_SELECT_TRIBUTE:
  case MSG_SELECT_UNSELECT_CARD:
  {
    return MessageTargets::MSG_DIST_TYPE_SPECIFIC_TEAM_DUELIST_STRIPPED;
  }
  case MSG_SELECT_BATTLECMD:
  case MSG_SELECT_IDLECMD:
  case MSG_SELECT_EFFECTYN:
  case MSG_SELECT_YESNO:
  case MSG_SELECT_OPTION:
  case MSG_SELECT_CHAIN:
  case MSG_SELECT_PLACE:
  case MSG_SELECT_DISFIELD:
  case MSG_SELECT_POSITION:
  case MSG_SORT_CARD:
  case MSG_SORT_CHAIN:
  case MSG_SELECT_COUNTER:
  case MSG_SELECT_SUM:
  case MSG_ROCK_PAPER_SCISSORS:
  case MSG_ANNOUNCE_RACE:
  case MSG_ANNOUNCE_ATTRIB:
  case MSG_ANNOUNCE_CARD:
  case MSG_ANNOUNCE_NUMBER:
  case MSG_ANNOUNCE_CARD_FILTER:
  case MSG_MISSED_EFFECT:
  {
    return MessageTargets::MSG_DIST_TYPE_SPECIFIC_TEAM_DUELIST;
  }
  case MSG_HINT:
  {
    switch (message[1U])
    {
    case 1U:
    case 2U:
    case 3U:
    case 5U:
    {
      return MessageTargets::MSG_DIST_TYPE_SPECIFIC_TEAM_DUELIST;
    }
    case 200U:
    {
      return MessageTargets::MSG_DIST_TYPE_SPECIFIC_TEAM;
    }
    case 4U:
    case 6U:
    case 7U:
    case 8U:
    case 9U:
    case 11U:
    {
      return MessageTargets::MSG_DIST_TYPE_EVERYONE_EXCEPT_TEAM_DUELIST;
    }
    default: /*case 10U: case 201U: case 202U: case 203U:*/
    {
      return MessageTargets::MSG_DIST_TYPE_EVERYONE;
    }
    }
  }
  case MSG_CONFIRM_CARDS:
  {
    const auto *ptr = message.data() + 2U;
    // if count(uint32_t) is not 0 and location(uint8_t) is LOCATION_DECK
    // then send to specific team duelist.
    if (Read<uint32_t>(ptr) != 0U)
    {
      ptr += 4U + 1U;
      if (Read<uint8_t>(ptr) == LOCATION_DECK)
        return MessageTargets::MSG_DIST_TYPE_SPECIFIC_TEAM_DUELIST;
    }
    return MessageTargets::MSG_DIST_TYPE_EVERYONE;
  }
  case MSG_SHUFFLE_HAND:
  case MSG_SHUFFLE_EXTRA:
  case MSG_SET:
  case MSG_MOVE:
  case MSG_DRAW:
  case MSG_TAG_SWAP:
  {
    return MessageTargets::MSG_DIST_TYPE_EVERYONE_STRIPPED;
  }
  default:
  {
    return MessageTargets::MSG_DIST_TYPE_EVERYONE;
  }
  }
}

void Duel::distribute_message(const std::vector<uint8_t> message)
{
  // TODO: SEND REPLAY MESSAGE
  this->send_core_replay_message(message);

  switch (this->get_message_target(message))
  {
  case MessageTargets::MSG_DIST_TYPE_SPECIFIC_TEAM_DUELIST_STRIPPED:
  {
    uint8_t team = this->get_team_message_receptor(message);
    this->send_message_to(this->get_swapped_team(team), true, false, this->handler.handle(team, message));
    break;
  }
  case MessageTargets::MSG_DIST_TYPE_EVERYONE_STRIPPED:
  {
    uint8_t teamA = this->get_swapped_team(0);
    uint8_t teamB = this->get_swapped_team(1);

    std::vector<uint8_t> messageA = handler.handle(0, message);
    std::vector<uint8_t> messageB = handler.handle(1, message);

    this->send_message_to(teamA, true, true, messageA);
    // messageSender.send(1, 1, teamA, messageA);
    this->send_message_to(teamB, true, true, messageB);
    // messageSender.send(1, 1, teamB, messageB);

    std::vector<uint8_t> strippedMessage = handler.handle(1, messageA);
    this->send_message_to(3, true, true, strippedMessage);
    // messageSender.send(1, 1, 3, strippedMessage);

    break;
  }
  case MessageTargets::MSG_DIST_TYPE_EVERYONE:
  {
    this->send_message_to_all(message);
    // sender.send(message);
    break;
  }
  case MessageTargets::MSG_DIST_TYPE_SPECIFIC_TEAM_DUELIST:
  {
    uint8_t team = this->get_team_message_receptor(message);
    this->send_message_to(this->get_swapped_team(team), true, false, message);
    // messageSender.send(0, 1, calculateTeam(team), message);
    break;
  }
  case MessageTargets::MSG_DIST_TYPE_SPECIFIC_TEAM:
  {
    uint8_t team = this->get_team_message_receptor(message);
    this->send_message_to(this->get_swapped_team(team), false, true, message);
    // messageSender.send(1, 0, calculateTeam(team), message);
    break;
  }
  }
}

uint8_t Duel::get_team_message_receptor(const std::vector<uint8_t> message)
{
  if (message[0] == MSG_HINT)
  {
    return message[2U];
  }

  return message[1U];
}

bool Duel::is_duel_finished(const std::vector<uint8_t> core_message)
{
  if (core_message[0U] != MSG_WIN)
  {
    return false;
  }

  uint8_t winner = (core_message[1U] > 1U) ? 2U : this->get_swapped_team(core_message[1U]);

  json message;
  message["type"] = "FINISH";
  message["reason"] = 0;
  message["winner"] = winner;

  std::string serialized_message = message.dump();

  this->send_message(serialized_message);

  return true;
}

bool Duel::does_message_required_answer(uint8_t message_type)
{
  switch (message_type)
  {
  case MSG_SELECT_CARD:
  case MSG_SELECT_TRIBUTE:
  case MSG_SELECT_UNSELECT_CARD:
  case MSG_SELECT_BATTLECMD:
  case MSG_SELECT_IDLECMD:
  case MSG_SELECT_EFFECTYN:
  case MSG_SELECT_YESNO:
  case MSG_SELECT_OPTION:
  case MSG_SELECT_CHAIN:
  case MSG_SELECT_PLACE:
  case MSG_SELECT_DISFIELD:
  case MSG_SELECT_POSITION:
  case MSG_SORT_CARD:
  case MSG_SORT_CHAIN:
  case MSG_SELECT_COUNTER:
  case MSG_SELECT_SUM:
  case MSG_ROCK_PAPER_SCISSORS:
  case MSG_ANNOUNCE_RACE:
  case MSG_ANNOUNCE_ATTRIB:
  case MSG_ANNOUNCE_CARD:
  case MSG_ANNOUNCE_NUMBER:
  case MSG_ANNOUNCE_CARD_FILTER:
  {
    return true;
  }
  default:
  {
    return false;
  }
  }
}