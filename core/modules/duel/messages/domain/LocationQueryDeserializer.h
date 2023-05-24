#ifndef LOCATION_QUERY_DESERIALIZER
#define LOCATION_QUERY_DESERIALIZER

#include "vector"
#include <optional>
#include "../../../shared/QueryRequest.h"
#include "../../../shared/Read.h"

class LocationQueryDeserializer {
public:
  std::vector<std::optional<Query>> deserialize(const std::vector<uint8_t>& queries);
};

#endif