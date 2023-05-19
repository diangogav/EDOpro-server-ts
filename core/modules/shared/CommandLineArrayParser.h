#ifndef COMMAND_LINE_ARRAY_PARSER
#define COMMAND_LINE_ARRAY_PARSER

#include <sstream>
#include <vector>

class CommandLineArrayParser {
private:
  std::string stringArrayOfNumbers;

public:
  CommandLineArrayParser(std::string stringArrayOfNumbers);
  std::vector<int> parse();
};

#endif