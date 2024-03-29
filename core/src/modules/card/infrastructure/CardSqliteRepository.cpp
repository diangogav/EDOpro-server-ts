#include "CardSqliteRepository.h"
#include "../../card/domain/CardTypes.h"
#include <filesystem>
namespace fs = std::filesystem;

static constexpr const char *ATTACH_STMT =
    R"(
ATTACH ? AS toMerge;
)";

static constexpr const char *SEARCH_STMT =
    R"(
SELECT id,alias,setcode,type,atk,def,level,race,attribute
FROM datas WHERE datas.id = ?;
)";

CardSqliteRepository::CardSqliteRepository()
{
  std::filesystem::path currentPath = std::filesystem::current_path();
  std::filesystem::path dbPath = currentPath / "jtp_evolution_cards.db";
  const char *path = dbPath.c_str();

  if (sqlite3_open(path, &db) != SQLITE_OK)
    throw std::runtime_error(sqlite3_errmsg(db));

  char *err = nullptr;

  if (sqlite3_prepare_v2(db, ATTACH_STMT, -1, &attachQuery, nullptr) != SQLITE_OK)
  {
    std::string errStr(sqlite3_errmsg(db));
    sqlite3_close(db);
    throw std::runtime_error(errStr);
  }

  if (sqlite3_prepare_v2(db, SEARCH_STMT, -1, &findQuery, nullptr) != SQLITE_OK)
  {
    std::string errStr(sqlite3_errmsg(db));
    sqlite3_finalize(attachQuery);
    sqlite3_close(db);
    throw std::runtime_error(errStr);
  }
}

CardSqliteRepository::~CardSqliteRepository() noexcept
{
	sqlite3_finalize(attachQuery);
	sqlite3_finalize(findQuery);
	sqlite3_close(db);
}

const OCG_CardData &CardSqliteRepository::find(uint32_t code) const noexcept
{
  auto AllocSetcodes = [&](uint64_t dbVal) -> uint16_t *
  {
    static constexpr std::size_t SETCODES = 4U;
    auto p = decltype(cardCodeCache)::value_type(code, std::make_unique<uint16_t[]>(SETCODES + 1U));
    auto &setcodes = cardCodeCache.emplace(std::move(p)).first->second;
    for (std::size_t i = 0U; i < SETCODES; i++)
      setcodes[i] = (dbVal >> (i * 16U)) & 0xFFFF;
    setcodes[SETCODES] = 0U;
    return setcodes.get();
  };
  auto &card = cardCache.emplace(code, OCG_CardData{}).first->second;
  sqlite3_reset(findQuery);
  sqlite3_bind_int(findQuery, 1, code);
  if (sqlite3_step(findQuery) == SQLITE_ROW)
  {
    card.code = sqlite3_column_int(findQuery, 0);
    card.alias = sqlite3_column_int(findQuery, 1);
    card.setcodes = AllocSetcodes(sqlite3_column_int64(findQuery, 2));
    card.type = sqlite3_column_int(findQuery, 3);
    card.attack = sqlite3_column_int(findQuery, 4);
    card.defense = sqlite3_column_int(findQuery, 5);
    card.link_marker = (card.type & TYPE_LINK) != 0U ? card.defense : 0;
    card.defense = (card.type & TYPE_LINK) != 0U ? 0 : card.defense;
    const auto dbLevel = sqlite3_column_int(findQuery, 6);
    card.level = dbLevel & 0x800000FF;
    card.lscale = (dbLevel >> 24U) & 0xFF;
    card.rscale = (dbLevel >> 16U) & 0xFF;
    card.race = sqlite3_column_int64(findQuery, 7);
    card.attribute = sqlite3_column_int(findQuery, 8);
  }
  return card;
}

void CardSqliteRepository::handle(void *payload, uint32_t code, OCG_CardData *data)
{
  *data = static_cast<CardSqliteRepository *>(payload)->find(code);
}