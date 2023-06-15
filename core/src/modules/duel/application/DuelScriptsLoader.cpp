#include "DuelScriptsLoader.h"
#include "../../shared/FileReader.h"
#include <filesystem>
namespace fs = std::filesystem;

DuelScriptsLoader::DuelScriptsLoader(OCGRepository repository, OCG_Duel duel) : repository{repository}, duel{duel} {}

void DuelScriptsLoader::load()
{
  fs::path path = fs::current_path().string() + "/core/scripts/";
  FileReader reader;
  std::vector<char> constantsBuffer = reader.read((path.string() + "constant.lua").c_str());
  int constantsScriptLoadResult = repository.loadScript(duel, constantsBuffer.data(), constantsBuffer.size(), "constant.lua");

  std::vector<char> utilityBuffer = reader.read((path.string() + "utility.lua").c_str());
  int utilityScriptLoadResult = repository.loadScript(duel, utilityBuffer.data(), utilityBuffer.size(), "utility.lua");
}