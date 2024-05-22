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
  std::filesystem::path currentPath = std::filesystem::current_path();
  std::filesystem::path scriptsPath = currentPath / "scripts/evolution";
  const char* path = scriptsPath.c_str();

  std::vector<char> buffer = reader.read(path, name);
  int loaded = repository.loadScript(duel, buffer.data(), buffer.size(), name);

  return loaded;
}
