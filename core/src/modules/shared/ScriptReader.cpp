#include <iostream>
#include "ScriptReader.h"
#include "FileReader.h"
#include <filesystem>
namespace fs = std::filesystem;

ScriptReader::ScriptReader(OCGRepository repository) : repository(repository) {}

int ScriptReader::handle(void *payload, void *duel, const char *name)
{
  ScriptReader *scriptReader = static_cast<ScriptReader *>(payload);
  return scriptReader->read(duel, name);
}

int ScriptReader::read(void *duel, const char *name)
{
  FileReader reader;
  fs::path path = fs::current_path().string() + "/core/scripts/";
  std::vector<char> buffer = reader.read((path.string() += name).c_str());
  int loaded = repository.loadScript(duel, buffer.data(), buffer.size(), name);
  return loaded;
}
