#include "FileReader.h"

std::vector<char> FileReader::read(const char *filename)
{
  std::ifstream file(filename, std::ios::ate);
  std::streamsize length = file.tellg();

  if (length == -1)
  {
    return std::vector<char>();
  }

  file.seekg(0, std::ios::beg);

  std::vector<char> buffer(length);

  file.read(buffer.data(), length);

  file.close();

  return buffer;
}
