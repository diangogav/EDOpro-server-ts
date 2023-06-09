#include "OCGRepository.h"
#include <iostream>
#include <dlfcn.h>
#include <cstring>

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

  OCG_DuelQueryCount = reinterpret_cast<OCG_DuelQueryCount_t>(dlsym(libhandle, "OCG_DuelQueryCount"));
  if (!OCG_DuelQueryCount)
  {
    throw std::runtime_error("Failed to load OCG_DuelQueryCount function");
  }

  OCG_DuelQueryLocation = reinterpret_cast<OCG_DuelQueryLocation_t>(dlsym(libhandle, "OCG_DuelQueryLocation"));
  if (!OCG_DuelQueryLocation)
  {
    throw std::runtime_error("Failed to load OCG_DuelQueryLocation function");
  }

  OCG_DuelProcess = reinterpret_cast<OCG_DuelProcess_t>(dlsym(libhandle, "OCG_DuelProcess"));
  if (!OCG_DuelProcess)
  {
    throw std::runtime_error("Failed to load OCG_DuelProcess function");
  }

  OCG_DuelGetMessage = reinterpret_cast<OCG_DuelGetMessage_t>(dlsym(libhandle, "OCG_DuelGetMessage"));
  if (!OCG_DuelGetMessage)
  {
    throw std::runtime_error("Failed to load OCG_DuelGetMessage function");
  }

  OCG_DuelSetResponse = reinterpret_cast<OCG_DuelSetResponse_t>(dlsym(libhandle, "OCG_DuelSetResponse"));
  if (!OCG_DuelSetResponse)
  {
    throw std::runtime_error("Failed to load OCG_DuelSetResponse function");
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

uint32_t OCGRepository::duelQueryCount(OCG_Duel duel, uint8_t team, uint32_t location)
{
  return OCG_DuelQueryCount(duel, team, location);
}

std::vector<uint8_t> OCGRepository::duelQueryLocation(OCG_Duel duel, OCG_QueryInfo query)
{
  uint32_t length = 0U;
  auto *pointer = OCG_DuelQueryLocation(duel, &length, query);
  std::vector<uint8_t> buffer(static_cast<std::vector<uint8_t>::size_type>(length));
  std::memcpy(buffer.data(), pointer, static_cast<std::size_t>(length));
  return buffer;
}

int OCGRepository::process(OCG_Duel duel)
{
  return OCG_DuelProcess(duel);
}

std::vector<std::vector<uint8_t>> OCGRepository::getMessages(OCG_Duel duel)
{
  uint32_t length = 0U;
  auto *pointer = OCG_DuelGetMessage(duel, &length);
  std::vector<uint8_t> buffer(static_cast<std::vector<uint8_t>::size_type>(length));
  std::memcpy(buffer.data(), pointer, static_cast<std::size_t>(length));
  return parseMessages(buffer);
}

std::vector<std::vector<uint8_t>> OCGRepository::parseMessages(const std::vector<uint8_t> &buffer)
{
  using length_t = uint32_t;
  static constexpr std::size_t sizeOfLength = sizeof(length_t);
  std::vector<std::vector<uint8_t>> msgs;
  if (buffer.empty())
    return msgs;
  const std::size_t bufSize = buffer.size();
  const uint8_t *const bufData = buffer.data();
  for (std::size_t pos = 0U; pos != bufSize;)
  {
    // Retrieve length of this message
    length_t l = 0U;
    std::memcpy(&l, bufData + pos, sizeOfLength);
    pos += sizeOfLength;
    // Copy message data to a new message
    auto &msg = msgs.emplace_back(l);
    std::memcpy(msg.data(), bufData + pos, l);
    pos += l;
  }
  return msgs;
}

void OCGRepository::setResponse(OCG_Duel duel, std::vector<uint8_t> buffer)
{
  OCG_DuelSetResponse(duel, buffer.data(), buffer.size());
}