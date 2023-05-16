#ifndef FILE_READER
#define FILE_READER

#include <fstream>
#include <vector>

class FileReader {
public:
  static std::vector<char> read(const char* filename);
};

#endif