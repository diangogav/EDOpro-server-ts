#ifndef CARD_SQLITE_REPOSITORY
#define CARD_SQLITE_REPOSITORY

#include <sqlite3.h>
#include "iostream"
#include "../../shared/ocgapi_types.h"
#include <unordered_map>
#include <memory>

class CardSqliteRepository
{
public:
  CardSqliteRepository();
  static void handle(void *payload, uint32_t code, OCG_CardData *data);
  bool merge(std::string_view path);
	const OCG_CardData& find(uint32_t code) const noexcept;

private:
	sqlite3* db{};
	sqlite3_stmt* attachQuery{};
	sqlite3_stmt* findQuery{};

	mutable std::unordered_map<uint32_t, OCG_CardData> cardCache;
	mutable std::unordered_map<uint32_t, std::unique_ptr<uint16_t[]>> cardCodeCache;
};

#endif