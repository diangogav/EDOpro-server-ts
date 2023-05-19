#include "OCGRepository.h"
#include <iostream>
#include <dlfcn.h>

void OCGRepository::loadFunctions()
{
  const char *librarypath = "/home/diango/code/edo-pro-server-ts/core/libocgcore.so";
  libhandle = dlopen(librarypath, RTLD_NOW | RTLD_LOCAL);

  if (libhandle == nullptr)
  {
    throw std::runtime_error(dlerror());
  }

  OCG_GetVersion = reinterpret_cast<OCG_GetVersion_t>(dlsym(libhandle, "OCG_GetVersion"));
  if (!OCG_GetVersion)
  {
    throw std::runtime_error("Failed to load OCG_GetVersion function");
  }

  OCG_CreateDuel = reinterpret_cast<OCG_CreateDuel_t>(dlsym(libhandle, "OCG_CreateDuel"));
  if (!OCG_CreateDuel)
  {
    throw std::runtime_error("Failed to load OCG_CreateDuel function");
  }

  OCG_LoadScript = reinterpret_cast<OCG_LoadScript_t>(dlsym(libhandle, "OCG_LoadScript"));
  if (!OCG_LoadScript)
  {
    throw std::runtime_error("Failed to load OCG_LoadScript function");
  }

  OCG_DuelNewCard = reinterpret_cast<OCG_DuelNewCard_t>(dlsym(libhandle, "OCG_DuelNewCard"));
  if (!OCG_DuelNewCard)
  {
    throw std::runtime_error("Failed to load OCG_LoadScript function");
  }

  OCG_StartDuel = reinterpret_cast<OCG_StartDuel_t>(dlsym(libhandle, "OCG_StartDuel"));
  if (!OCG_StartDuel)
  {
    throw std::runtime_error("Failed to load OCG_StartDuel function");
  }
};

OCGRepository::OCGRepository()
{
  loadFunctions();
};

void OCGRepository::getVersion(int *major, int *minor)
{
  OCG_GetVersion(major, minor);
};

int OCGRepository::createDuel(OCG_Duel *duel, OCG_DuelOptions options)
{
  return OCG_CreateDuel(duel, options);
};

int OCGRepository::loadScript(OCG_Duel duel, const char *buffer, uint32_t length, const char *name)
{
  return OCG_LoadScript(duel, buffer, length, name);
}

void OCGRepository::addCard(OCG_Duel duel, OCG_NewCardInfo card)
{
  OCG_DuelNewCard(duel, card);
}

void OCGRepository::startDuel(OCG_Duel duel)
{
  OCG_StartDuel(duel);
}