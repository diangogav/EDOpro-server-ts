#ifndef QUERY_DESERIALIZER
#define QUERY_DESERIALIZER

#include "vector"
#include <optional>
#include "../../../shared/QueryRequest.h"
#include "../../../shared/Read.h"

class QueryDeserializer {
public:
  std::vector<std::optional<Query>> deserializeLocationQuery(const std::vector<uint8_t>& queries);
  std::optional<Query> deserialize(const std::vector<uint8_t>& queries);
};

#endif