#include "DuelCreator.h"
#include "../../shared/FileReader.h"
#include "../../shared/ScriptReader.h"
#include <iostream>
#include <cstring>

DuelCreator::DuelCreator(OCGRepository repository) : repository{repository} {}

void myCardReaderFunction(void *payload, uint32_t code, OCG_CardData *data)
{
    // Implement your custom card reader function here.
    printf("myCardReaderFunction \n");
}

void myCardReaderDoneFunction(void *payload, OCG_CardData *data)
{
    // Implement your custom card reader done function here.
    printf("myCardReaderDoneFunction \n");
}

void myLogHandlerFunction(void *payload, const char *string, int type)
{
    // Implement your custom log handler function here.
    printf("Mensaje recibido: %s\n", string);
}

void *myCardReaderPayload = nullptr;
void *myLogHandlerPayload = nullptr;     // Replace with your own payload data.
void *myCardReaderDonePayload = nullptr; // Replace with your own payload data.

OCG_Duel DuelCreator::run(uint64_t flags, uint32_t startingLP, uint32_t startingDrawCount, uint32_t drawCountPerTurn, uint16_t extraRules, std::vector<int> playerMainDeck, std::vector<int> opponentMainDeck)
{
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
    options.payload2 = new ScriptReader(repository);
    ;
    options.logHandler = myLogHandlerFunction;
    options.payload3 = myLogHandlerPayload;
    options.cardReaderDone = myCardReaderDoneFunction;
    options.payload4 = myCardReaderDonePayload;
    options.enableUnsafeLibraries = 0;

    OCG_Duel duel;

    int result = repository.createDuel(&duel, options);
    std::cout << result << std::endl;

    if (result != OCG_DUEL_CREATION_SUCCESS)
    {
        exit(1);
    }

    FileReader reader;
    std::vector<char> constantsBuffer = reader.read("/home/diango/code/edo-pro-server-ts/core/scripts/constant.lua");
    int constantsScriptLoadResult = repository.loadScript(duel, constantsBuffer.data(), constantsBuffer.size(), "constants.lua");

    std::vector<char> utilityBuffer = reader.read("/home/diango/code/edo-pro-server-ts/core/scripts/utility.lua");
    int utilityScriptLoadResult = repository.loadScript(duel, utilityBuffer.data(), utilityBuffer.size(), "utility.lua");

    OCG_NewCardInfo cardInfo{};

    cardInfo.team = 0;
    cardInfo.duelist = 0;
    cardInfo.con = 0;
    cardInfo.loc = 1;
    cardInfo.seq = 0;
    cardInfo.pos = 8;

    for (auto code : playerMainDeck)
    {
        cardInfo.code = code;
        repository.addCard(duel, cardInfo);
    }

    cardInfo.team = 1;
    cardInfo.duelist = 0;
    cardInfo.con = 1;
    cardInfo.loc = 1;
    cardInfo.seq = 0;
    cardInfo.pos = 8;

    for (auto code : opponentMainDeck)
    {
        cardInfo.code = code;
        repository.addCard(duel, cardInfo);
    }

    repository.startDuel(duel);

    uint32_t playerDeckSize = repository.duelQueryCount(duel, 0, 1);
    uint32_t opponentDeckSize = repository.duelQueryCount(duel, 1, 1);

    std::string message = "CMD:START|";
    message += std::to_string(playerDeckSize) + "|";
    message += std::to_string(opponentDeckSize);
    std::cout << message << std::endl;
};