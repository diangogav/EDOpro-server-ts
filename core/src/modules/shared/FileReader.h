#ifndef FILE_READER
#define FILE_READER

#include <fstream>
#include <vector>
#include <filesystem>
#include <string>

namespace fs = std::filesystem;

class FileReader
{
public:
  static std::vector<char> read(const std::string& directory, const std::string& filename);
};

#endif