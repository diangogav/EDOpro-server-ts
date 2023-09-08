#include "./includes/dueling.h"

Dueling::Dueling(Config config, std::vector<Player> players) : config{config}, players{players}
{
  DrawCardHandler handler;
};

void Dueling::create()
{
  std::random_device rd;
  unsigned int seed = rd();
  mt19937 rnd(seed);
  unsigned int duel_seed = rnd.rand();
  this->duel = create_duel(duel_seed);
}

void Dueling::load_scripts()
{
  preload_script(this->duel, "./script/special.lua", 0);
}

void Dueling::load_players()
{
  set_player_info(this->duel, 0, config.lp, config.starting_draw_count, config.draw_count);
  set_player_info(this->duel, 1, config.lp, config.starting_draw_count, config.draw_count);
}

void Dueling::load_decks()
{
  for (const auto player : this->players)
  {
    for (const auto card : player.main_deck)
    {
      new_card(this->duel, card, player.team, player.team, LOCATION_DECK, 0, POS_FACEDOWN_DEFENSE);
    }

    for (const auto card : player.extra_deck)
    {
      new_card(this->duel, card, player.team, player.team, LOCATION_EXTRA, 0, POS_FACEDOWN_DEFENSE);
    }
  }
}

void Dueling::start()
{
  uint32_t player_deck_size = query_field_count(this->duel, 0, LOCATION_DECK);
  uint32_t player_extra_deck_size = query_field_count(this->duel, 0, LOCATION_EXTRA);
  uint32_t opponent_deck_size = query_field_count(this->duel, 1, LOCATION_DECK);
  uint32_t opponent_extra_deck_size = query_field_count(this->duel, 1, LOCATION_EXTRA);

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
}

void Dueling::send_message(std::string message)
{
  uint32_t message_size = static_cast<uint32_t>(message.size());
  std::cout.write(reinterpret_cast<const char *>(&message_size), sizeof(message_size));
  std::cout << message;
  std::cout.flush();
}

int Dueling::status()
{
  return process(this->duel);
}

void Dueling::processCore(char *msgbuffer, unsigned int len)
{
  char *currentPosition, *workingBuffer, *bufferPointer = msgbuffer;
  int player, count, type;
  while (bufferPointer - msgbuffer < (int)len)
  {
    currentPosition = bufferPointer;
    unsigned char engType = BufferIO::ReadUInt8(bufferPointer);
    fprintf(stderr, "engType en decimal: %u\n", static_cast<unsigned int>(engType));
  }
}

void Dueling::send_message_to(uint8_t team, bool cacheable, bool all, std::vector<uint8_t> core_message)
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

uint8_t Dueling::get_swapped_team(uint8_t team)
{
  return this->config.first_to_play ^ team;
}

std::vector<std::vector<uint8_t>> Dueling::messages()
{
  std::vector<std::vector<uint8_t>> msgs;
  char engineBuffer[0x1000];
  int32 length = get_message(this->duel, (byte *)&engineBuffer);
  std::vector<uint8_t> bufferData(engineBuffer, engineBuffer + length);
  msgs.push_back(bufferData);
  return msgs;
}

void Dueling::send_message_to_all(std::vector<uint8_t> core_message)
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

void Dueling::distribute_message(const std::vector<uint8_t> message)
{
  // TODO: SEND REPLAY MESSAGE
  // this->send_core_replay_message(message);

  switch (this->get_message_target(message))
  {
  // case MessageTargets::MSG_DIST_TYPE_SPECIFIC_TEAM_DUELIST_STRIPPED:
  // {
  //   uint8_t team = this->get_team_message_receptor(message);
  //   this->send_message_to(this->get_swapped_team(team), true, false, this->handler.handle(team, message));
  //   break;
  // }
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
    // case MessageTargets::MSG_DIST_TYPE_SPECIFIC_TEAM:
    // {
    //   uint8_t team = this->get_team_message_receptor(message);
    //   this->send_message_to(this->get_swapped_team(team), false, true, message);
    //   // messageSender.send(1, 0, calculateTeam(team), message);
    //   break;
    // }
  }
}

MessageTargets Dueling::get_message_target(const std::vector<uint8_t> message)
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
  // case MSG_ANNOUNCE_CARD_FILTER:
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

void Dueling::send_raw_message(std::vector<uint8_t> core_message, int status)
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

uint8_t Dueling::get_team_message_receptor(const std::vector<uint8_t> message)
{
  if (message[0] == MSG_HINT)
  {
    return message[2U];
  }

  return message[1U];
}