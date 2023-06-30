#include "FileReader.h"

std::vector<char> FileReader::read(const std::string &directory, const std::string &filename)
{
  for (const auto &entry : fs::recursive_directory_iterator(directory))
  {
    if (entry.is_regular_file() && entry.path().filename() == filename)
    {
      std::ifstream file(entry.path(), std::ios::binary);
      if (file)
      {
        file.seekg(0, std::ios::end);
        std::streamsize fileSize = file.tellg();
        file.seekg(0, std::ios::beg);

        std::vector<char> buffer(fileSize);
        if (file.read(buffer.data(), fileSize))
        {
          return buffer;
        }
      }
    }
  }

  return {};
}
