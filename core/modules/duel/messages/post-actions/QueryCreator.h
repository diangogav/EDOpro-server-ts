#ifndef QUERY_CREATOR
#define QUERY_CREATOR

#include "vector"
#include "iostream"
#include <variant>
#include "../../../shared/Read.h"
#include "../../../shared/QueryRequest.h"

class QueryCreator {
public:
  std::vector<QueryRequest> run(std::vector<uint8_t>& message);
};

#endif