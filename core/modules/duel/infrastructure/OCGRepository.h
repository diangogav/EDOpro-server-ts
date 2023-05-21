#ifndef OCG_REPOSITORY
#define OCG_REPOSITORY
#include "../../../ocgapi_types.h"
#include <vector>

class OCGRepository
{
private:
  void *libhandle;
  void loadFunctions();
  std::vector<std::vector<uint8_t>> parseMessages(const std::vector<uint8_t> &buffer);
  typedef void (*OCG_GetVersion_t)(int *, int *);
  typedef int (*OCG_CreateDuel_t)(OCG_Duel *, OCG_DuelOptions);
  typedef int (*OCG_LoadScript_t)(OCG_Duel, const char *, uint32_t, const char *);
  typedef void (*OCG_DuelNewCard_t)(OCG_Duel, OCG_NewCardInfo);
  typedef void (*OCG_StartDuel_t)(OCG_Duel);
  typedef uint32_t (*OCG_DuelQueryCount_t)(OCG_Duel, uint8_t, uint32_t);
  typedef void *(*OCG_DuelQueryLocation_t)(OCG_Duel, uint32_t *, OCG_QueryInfo);
  typedef int (*OCG_DuelProcess_t)(OCG_Duel);
  typedef void *(*OCG_DuelGetMessage_t)(OCG_Duel, uint32_t *);

  OCG_GetVersion_t OCG_GetVersion;
  OCG_CreateDuel_t OCG_CreateDuel;
  OCG_LoadScript_t OCG_LoadScript;
  OCG_DuelNewCard_t OCG_DuelNewCard;
  OCG_StartDuel_t OCG_StartDuel;
  OCG_DuelQueryCount_t OCG_DuelQueryCount;
  OCG_DuelQueryLocation_t OCG_DuelQueryLocation;
  OCG_DuelProcess_t OCG_DuelProcess;
  OCG_DuelGetMessage_t OCG_DuelGetMessage;

public:
  OCGRepository();
  void getVersion(int *major, int *minor);
  int createDuel(OCG_Duel *duel, OCG_DuelOptions options);
  int loadScript(OCG_Duel duel, const char *buffer, uint32_t length, const char *name);
  void addCard(OCG_Duel duel, OCG_NewCardInfo card);
  void startDuel(OCG_Duel duel);
  uint32_t duelQueryCount(OCG_Duel duel, uint8_t team, uint32_t location);
  std::vector<uint8_t> duelQueryLocation(OCG_Duel duel, uint8_t team);
  int process(OCG_Duel duel);
  std::vector<std::vector<uint8_t>> getMessages(OCG_Duel duel);
};
#endif