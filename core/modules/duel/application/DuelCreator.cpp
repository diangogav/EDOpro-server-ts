#include "DuelCreator.h"
#include "../../shared/FileReader.h"
#include  "../../shared/ScriptReader.h"
#include <iostream>
#include <cstring>

DuelCreator::DuelCreator(OCGRepository repository) : repository { repository } {}

void myCardReaderFunction(void* payload, uint32_t code, OCG_CardData* data) {
    // Implement your custom card reader function here.
}

void myCardReaderDoneFunction(void* payload, OCG_CardData* data) {
    // Implement your custom card reader done function here.
}

void myLogHandlerFunction(void* payload, const char* string, int type) {
    // Implement your custom log handler function here.
}

void* myCardReaderPayload = nullptr;
void* myLogHandlerPayload = nullptr; // Replace with your own payload data.
void* myCardReaderDonePayload = nullptr; // Replace with your own payload data.

void DuelCreator::run(uint64_t flags, uint32_t startingLP, uint32_t startingDrawCount, uint32_t drawCountPerTurn, uint16_t extraRules) {
    OCG_DuelOptions options;
    options.seed[0] = 0;
    options.seed[1] = 0;
    options.seed[2] = 0;
    options.seed[3] = 0;
    options.flags = flags;
    options.team1.startingLP = startingLP;
    options.team1.startingDrawCount = startingDrawCount;
    options.team1.drawCountPerTurn = drawCountPerTurn;
    options.team2.startingLP = startingLP;
    options.team2.startingDrawCount = startingDrawCount;
    options.team2.drawCountPerTurn = drawCountPerTurn;
    options.cardReader = myCardReaderFunction;
    options.payload1 = myCardReaderPayload;
    options.scriptReader = ScriptReader::handle;
    options.payload2 = new ScriptReader(repository);;
    options.logHandler = myLogHandlerFunction;
    options.payload3 = myLogHandlerPayload;
    options.cardReaderDone = myCardReaderDoneFunction;
    options.payload4 = myCardReaderDonePayload;
    options.enableUnsafeLibraries = 0;

    OCG_Duel duel;

    int result = repository.createDuel(&duel, options);
        std::cout<<result<<std::endl;

    if(result != OCG_DUEL_CREATION_SUCCESS) {
        exit(1);
    }

    FileReader reader;
    std::vector<char> constantsBuffer = reader.read("/home/diango/code/edo-pro-server-ts/core/scripts/constant.lua");
    int constantsScriptLoadResult = repository.loadScript(duel, constantsBuffer.data(), constantsBuffer.size(), "constants.lua");
    
    std::vector<char> utilityBuffer = reader.read("/home/diango/code/edo-pro-server-ts/core/scripts/utility.lua");
    int utilityScriptLoadResult = repository.loadScript(duel, utilityBuffer.data(), utilityBuffer.size(), "utility.lua");
};