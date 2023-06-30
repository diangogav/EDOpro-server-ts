#include "DuelScriptsLoader.h"
#include "../../shared/FileReader.h"
#include <filesystem>
namespace fs = std::filesystem;

DuelScriptsLoader::DuelScriptsLoader(OCGRepository repository, OCG_Duel duel) : repository{repository}, duel{duel} {}

void DuelScriptsLoader::load()
{
  FileReader reader;
  std::filesystem::path currentPath = std::filesystem::current_path();
  std::filesystem::path scriptsPath = currentPath / "core/scripts";
  const char* path = scriptsPath.c_str();

  std::vector<char> constantsBuffer = reader.read(path, "constant.lua");
  int constantsScriptLoadResult = repository.loadScript(duel, constantsBuffer.data(), constantsBuffer.size(), "constant.lua");

  std::vector<char> utilityBuffer = reader.read(path, "utility.lua");
  int utilityScriptLoadResult = repository.loadScript(duel, utilityBuffer.data(), utilityBuffer.size(), "utility.lua");
}