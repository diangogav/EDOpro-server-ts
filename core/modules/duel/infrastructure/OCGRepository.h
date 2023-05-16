#ifndef OCG_REPOSITORY
#define OCG_REPOSITORY
#include "../../../ocgapi_types.h"
class OCGRepository {
private:
  void *libhandle;
  void loadFunctions();
  typedef void (*OCG_GetVersion_t)(int*, int*);
  typedef int (*OCG_CreateDuel_t)(OCG_Duel*, OCG_DuelOptions);
  typedef int (*OCG_LoadScript_t)(OCG_Duel, const char*, uint32_t, const char*);
  typedef void (*OCG_DuelNewCard_t)(OCG_Duel, OCG_NewCardInfo);
  OCG_GetVersion_t OCG_GetVersion;
  OCG_CreateDuel_t OCG_CreateDuel;
  OCG_LoadScript_t OCG_LoadScript;
  OCG_DuelNewCard_t OCG_DuelNewCard;
public:
  OCGRepository();
  void getVersion(int* major, int* minor);
  int createDuel(OCG_Duel* duel, OCG_DuelOptions options);
  int loadScript(OCG_Duel duel, const char* buffer, uint32_t length, const char* name);
  void addCard(OCG_Duel duel, OCG_NewCardInfo card);
};
#endif