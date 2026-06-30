#include <iostream>
#include "ScriptReader.h"
#include "FileReader.h"
#include <filesystem>
#include <cstdlib>
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
  // Resources live under RESOURCES_DIR (default resources/current — the symlink
  // maintained by the resource refresh), matching the TS config.resources.dir.
  const char *resourcesDir = std::getenv("RESOURCES_DIR");
  std::filesystem::path scriptsPath =
      currentPath / (resourcesDir ? resourcesDir : "resources/current") / "edopro/scripts";
  const char* path = scriptsPath.c_str();

  std::vector<char> buffer = reader.read(path, name);
  int loaded = repository.loadScript(duel, buffer.data(), buffer.size(), name);

  return loaded;
}
