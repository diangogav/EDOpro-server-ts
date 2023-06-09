#ifndef LOCATION_QUERY_SERIALIZER
#define LOCATION_QUERY_SERIALIZER

#include "vector"
#include <optional>
#include "../../../shared/QueryRequest.h"
#include "../../../shared/Read.h"
#include "../../../shared/Write.h"
#include "../../../shared/DuelPositions.h"

class LocationQuerySerializer {
public:
  std::vector<uint8_t> serialize(const std::vector<std::optional<Query>>& queries, bool isPublic);
};
#endif