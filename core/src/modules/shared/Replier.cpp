#include "Replier.h"

Replier &Replier::getInstance()
{
  static Replier instance;
  return instance;
}

void Replier::set(uint8_t id)
{
  this->id = id;
}

Replier::Replier()
{
  // Inicialización del singleton.
}

Replier::~Replier()
{
  // Liberar recursos del singleton.
}