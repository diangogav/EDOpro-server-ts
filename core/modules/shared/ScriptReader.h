#ifndef SCRIPT_READER
#define SCRIPT_READER

#include "../duel/infrastructure/OCGRepository.h"

class ScriptReader
{
private:
    OCGRepository repository;

public:
    ScriptReader(OCGRepository repository);
    static int handle(void *payload, void *duel, const char *name);
    int read(void *duel, const char *name);
};

#endif