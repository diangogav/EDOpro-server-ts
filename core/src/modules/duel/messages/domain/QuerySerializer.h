#ifndef QUERY_SERIALIZER
#define QUERY_SERIALIZER

#include "vector"
#include <optional>
#include "../../../shared/QueryRequest.h"
#include "../../../shared/Read.h"
#include "../../../shared/Write.h"
#include "../../../shared/DuelPositions.h"

class QuerySerializer {
public:
  std::vector<uint8_t> serialize(const std::optional<Query> &optionalQuery, bool isPublic);
  std::vector<uint8_t> serializeLocationQuery(const std::vector<std::optional<Query>>& queries, bool isPublic);
};
#endif