#include "CardSqliteRepository.h"
#include "../../card/domain/CardTypes.h"

static constexpr const char *DB_SCHEMAS =
    R"(
CREATE TABLE "datas" (
	"id"        INTEGER,
	"ot"        INTEGER,
	"alias"     INTEGER,
	"setcode"   INTEGER,
	"type"      INTEGER,
	"atk"       INTEGER,
	"def"       INTEGER,
	"level"     INTEGER,
	"race"      INTEGER,
	"attribute" INTEGER,
	"category"  INTEGER,
	PRIMARY KEY("id")
);
CREATE TABLE "texts" (
	"id"    INTEGER,
	"name"  TEXT,
	"desc"  TEXT,
	"str1"  TEXT,
	"str2"  TEXT,
	"str3"  TEXT,
	"str4"  TEXT,
	"str5"  TEXT,
	"str6"  TEXT,
	"str7"  TEXT,
	"str8"  TEXT,
	"str9"  TEXT,
	"str10" TEXT,
	"str11" TEXT,
	"str12" TEXT,
	"str13" TEXT,
	"str14" TEXT,
	"str15" TEXT,
	"str16" TEXT,
	PRIMARY KEY("id")
);
)";

static constexpr const char *ATTACH_STMT =
    R"(
ATTACH ? AS toMerge;
)";

static constexpr const char *SEARCH_STMT =
    R"(
SELECT id,alias,setcode,type,atk,def,level,race,attribute
FROM datas WHERE datas.id = ?;
)";

static constexpr const char *MERGE_DATAS_STMT =
    R"(
INSERT OR REPLACE INTO datas SELECT * FROM toMerge.datas;
)";

static constexpr const char *MERGE_TEXTS_STMT =
    R"(
INSERT OR REPLACE INTO texts SELECT * FROM toMerge.texts;
)";

static constexpr const char *DETACH_STMT =
    R"(
DETACH toMerge;
)";

CardSqliteRepository::CardSqliteRepository()
{
  if (sqlite3_open(":memory:", &db) != SQLITE_OK)
    throw std::runtime_error(sqlite3_errmsg(db));

  char *err = nullptr;

  if (sqlite3_exec(db, DB_SCHEMAS, nullptr, nullptr, &err) == SQLITE_ABORT)
  {
    std::string errStr(err);
    sqlite3_free(err);
    sqlite3_close(db);
    throw std::runtime_error(errStr);
  }

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

bool CardSqliteRepository::merge(std::string_view path)
{
  sqlite3_reset(attachQuery);
  sqlite3_bind_text(attachQuery, 1, path.data(), -1, SQLITE_TRANSIENT);
  if (sqlite3_step(attachQuery) != SQLITE_DONE)
  {
    return false;
  }
  sqlite3_exec(db, MERGE_DATAS_STMT, nullptr, nullptr, nullptr);
  sqlite3_exec(db, MERGE_TEXTS_STMT, nullptr, nullptr, nullptr);
  sqlite3_exec(db, DETACH_STMT, nullptr, nullptr, nullptr);
  return true;
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