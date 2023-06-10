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
  printf("script name\n");
  printf(name);
  printf("\n");
  FileReader reader;
  std::string filePath = "/home/diango/code/edo-pro-server-ts/core/scripts/";
  filePath += name;
  std::vector<char> buffer = reader.read(filePath.c_str());
  int loaded = repository.loadScript(duel, buffer.data(), buffer.size(), name);
  printf("%d", loaded);
  printf("\n");
  return loaded;
}
