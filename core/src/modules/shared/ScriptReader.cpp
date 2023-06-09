#include <iostream>
#include "ScriptReader.h"
#include "FileReader.h"

ScriptReader::ScriptReader(OCGRepository repository) : repository(repository) {}

int ScriptReader::handle(void *payload, void *duel, const char *name)
{
  ScriptReader *scriptReader = static_cast<ScriptReader *>(payload);
  return scriptReader->read(duel, name);
}

int ScriptReader::read(void *duel, const char *name)
{
  FileReader reader;
  std::string filePath = "/home/diango/code/edo-pro-server-ts/core/scripts/";
  filePath += name;
  std::vector<char> buffer = reader.read(filePath.c_str());
  int result = repository.loadScript(duel, buffer.data(), buffer.size(), name);
  return 0;
}
